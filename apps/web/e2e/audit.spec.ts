import { test, expect } from '@playwright/test';

// Phase 4: full audit flow. Requires Supabase + processor + RQ worker running.

test('run an audit and see source-linked findings', async ({ page }) => {
  const unique = Date.now();
  await page.goto('/login');
  await page.getByRole('button', { name: 'Sign up' }).click();
  await page.getByLabel('Organization name').fill(`Audit Org ${unique}`);
  await page.getByLabel('Email').fill(`audit+${unique}@scopesignal.test`);
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

  await page.getByRole('link', { name: 'New Project' }).first().click();
  await page.getByLabel('Project name').fill(`Westside ${unique}`);
  await page.getByRole('button', { name: 'Create project' }).click();
  await page.getByRole('link', { name: 'Manage documents' }).click();

  // Upload two communications: an unrecorded conduit reroute, and a recorded CO-010.
  const docInput = page.locator('input[type="file"][accept=".pdf,.eml,.txt"]');
  await docInput.setInputFiles({
    name: 'conduit.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from(
      'Per RFI-042, the GC directed additional conduit routing to the revised equipment location. ' +
        'Please extend the conduit run accordingly.',
    ),
  });
  await page.getByRole('button', { name: 'Upload', exact: true }).click();
  await expect(page.locator('li', { hasText: 'conduit.txt' }).getByText('Parsed')).toBeVisible();

  await docInput.setInputFiles({
    name: 'co010.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from(
      'This confirms CO-010 for the additional lighting circuits in the east wing. Proceed with the added circuits.',
    ),
  });
  await page.getByRole('button', { name: 'Upload', exact: true }).click();
  await expect(page.locator('li', { hasText: 'co010.txt' }).getByText('Parsed')).toBeVisible();

  // Import a register containing CO-010.
  await page
    .locator('input[type="file"][accept=".csv"]')
    .setInputFiles({
      name: 'register.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(
        'CO Number,Description,Date Submitted,Status,Amount\n' +
          'CO-010,Additional lighting circuits east wing,2025-02-21,Approved,"$4,800.00"\n',
      ),
    });
  await page.getByRole('button', { name: 'Upload CSV' }).click();
  await page.getByRole('button', { name: /Import 1 entries/ }).click();
  await expect(page.getByText('Imported 1 register entries.')).toBeVisible();

  // Back to the project, then into audits.
  await page.getByRole('link', { name: new RegExp(`Westside ${unique}`) }).click();
  await expect(page.getByRole('heading', { name: `Westside ${unique}` })).toBeVisible();
  await page.getByRole('link', { name: 'View audits' }).click();
  await page.getByRole('button', { name: 'Start Audit' }).click();

  // The detail page auto-refreshes; wait for completion and the findings list.
  await expect(page.getByRole('heading', { name: 'Audit results' })).toBeVisible();
  await expect(page.getByRole('button', { name: /RFI-042/ })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: /CO-010/ })).toBeVisible();

  // Conduit finding: no register match + source evidence.
  await page.getByRole('button', { name: /RFI-042/ }).click();
  await expect(page.getByRole('heading', { name: /RFI-042/ })).toBeVisible();
  await expect(page.getByText('No match found')).toBeVisible();
  await expect(page.getByText(/additional conduit routing/)).toBeVisible();

  // Recorded CO-010 finding: matched in register.
  await page.getByRole('button', { name: /CO-010/ }).click();
  await expect(page.getByText('Matched in register')).toBeVisible();

  // --- Phase 5: record a review decision on the conduit finding ---
  await page.getByRole('button', { name: /RFI-042/ }).click();
  await page.getByRole('radio', { name: /Confirmed Unrecorded/ }).check();
  await page.getByPlaceholder('Optional context for this decision…').fill('No CO on file; follow up.');
  await page.getByRole('button', { name: 'Save decision' }).click();

  await expect(page.getByText(/Saved ·/)).toBeVisible();
  // The left-list item now reflects the new status, and the summary chip appears.
  await expect(page.getByRole('button', { name: /RFI-042[\s\S]*Confirmed Unrecorded/ })).toBeVisible();

  // Decision persists across reload (stored with reviewer + timestamp).
  await page.reload();
  await page.getByRole('button', { name: /RFI-042/ }).click();
  await expect(page.getByText(/Last reviewed/)).toBeVisible();

  // --- Phase 6: export the report (PDF + CSV) ---
  const m = new URL(page.url()).pathname.match(/projects\/([^/]+)\/audits\/([^/]+)/);
  const [, pid, aid] = m!;

  const pdf = await page.request.get(`/api/projects/${pid}/audits/${aid}/pdf`);
  expect(pdf.ok()).toBeTruthy();
  expect(pdf.headers()['content-type']).toContain('application/pdf');
  expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-');

  const csv = await page.request.get(`/api/projects/${pid}/audits/${aid}/csv`);
  expect(csv.ok()).toBeTruthy();
  const csvText = await csv.text();
  expect(csvText).toContain('RFI-042');
  expect(csvText).toContain('Confirmed Unrecorded');
});
