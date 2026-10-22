import { test, expect } from '@playwright/test';

// Phase 6: cross-tenant isolation. A second organization must not be able to
// read the first organization's project (acceptance criterion #12).

async function signUp(page: import('@playwright/test').Page, label: string) {
  const unique = `${label}-${Date.now()}`;
  await page.goto('/login');
  await page.getByRole('button', { name: 'Sign up' }).click();
  await page.getByLabel('Organization name').fill(`Org ${unique}`);
  await page.getByLabel('Email').fill(`authz-${unique}@scopesignal.test`);
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
}

test('a second org cannot access the first org project', async ({ page }) => {
  // Org A creates a project.
  await signUp(page, 'a');
  await page.getByRole('link', { name: 'New Project' }).first().click();
  await page.getByLabel('Project name').fill('Confidential Project A');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByRole('heading', { name: 'Confidential Project A' })).toBeVisible();
  const projectAUrl = new URL(page.url()).pathname; // /projects/<id>

  // Sign out, sign up as Org B.
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await signUp(page, 'b');

  // Org B tries to open Org A's project URL -> 404 (RLS hides it).
  const resp = await page.goto(projectAUrl);
  expect(resp?.status()).toBe(404);
  await expect(page.getByText('Confidential Project A')).toHaveCount(0);

  // And the report routes for a foreign project are not accessible either.
  const idMatch = projectAUrl.match(/projects\/([^/]+)/);
  const pdf = await page.request.get(`/api/projects/${idMatch![1]}/audits/00000000-0000-0000-0000-000000000000/pdf`);
  expect(pdf.status()).toBe(404);
});
