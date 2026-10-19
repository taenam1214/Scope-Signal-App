import { test, expect } from '@playwright/test';

// Phase 3: upload a document (parsed via the processor) and import a register CSV.
// Requires the local Supabase stack AND the processor service running.

async function signUpAndCreateProject(page: import('@playwright/test').Page) {
  const unique = Date.now();
  await page.goto('/login');
  await page.getByRole('button', { name: 'Sign up' }).click();
  await page.getByLabel('Organization name').fill(`Docs Org ${unique}`);
  await page.getByLabel('Email').fill(`docs+${unique}@scopesignal.test`);
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

  await page.getByRole('link', { name: 'New Project' }).first().click();
  await page.getByLabel('Project name').fill(`Docs Project ${unique}`);
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByRole('heading', { name: `Docs Project ${unique}` })).toBeVisible();
  await page.getByRole('link', { name: 'Manage documents' }).click();
  await expect(page.getByRole('heading', { name: 'Documents' })).toBeVisible();
}

test('upload a TXT document and see it parsed', async ({ page }) => {
  await signUpAndCreateProject(page);

  await page.locator('input[type="file"][accept=".pdf,.eml,.txt"]').setInputFiles({
    name: 'field-note.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from(
      'GC directed additional conduit routing to the revised equipment location.\n\n' +
        'No change order was issued for this work.',
    ),
  });
  await page.getByRole('button', { name: 'Upload', exact: true }).click();

  const row = page.locator('li', { hasText: 'field-note.txt' });
  await expect(row).toBeVisible();
  await expect(row.getByText('Parsed')).toBeVisible();
});

test('import a change-order register CSV', async ({ page }) => {
  await signUpAndCreateProject(page);

  const csv =
    'CO Number,Description,Date Submitted,Status,Amount\n' +
    'CO-001,Added lighting circuits,2025-02-10,Approved,"$3,200.00"\n' +
    'CO-002,Relocated panel board,2025-03-05,Pending,"$1,100.00"\n';

  await page.getByRole('button', { name: 'Upload CSV' }).scrollIntoViewIfNeeded();
  await page
    .locator('input[type="file"][accept=".csv"]')
    .setInputFiles({ name: 'register.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await page.getByRole('button', { name: 'Upload CSV' }).click();

  // Preview appears with the detected mapping and row count.
  await expect(page.getByText('Preview (2 rows)')).toBeVisible();
  await expect(page.getByText('CO-001')).toBeVisible();

  await page.getByRole('button', { name: /Import 2 entries/ }).click();
  await expect(page.getByText('Imported 2 register entries.')).toBeVisible();
});
