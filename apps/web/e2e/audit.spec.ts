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

  // The detail page auto-refreshes; wait for completion and findings.
  await expect(page.getByRole('heading', { name: 'Audit results' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /RFI-042/ })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('No match found')).toBeVisible();
  await expect(page.getByText('Matched in register')).toBeVisible();
  // Evidence excerpt is shown.
  await expect(page.getByText(/additional conduit routing/)).toBeVisible();
});
