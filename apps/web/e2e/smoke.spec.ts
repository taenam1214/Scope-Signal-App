import { test, expect } from '@playwright/test';

// Phase 1 smoke test: the app boots and the landing + dashboard render.
// Uses no real customer data. The full synthetic-data E2E workflow lands in Phase 6.

test('landing page renders the value proposition', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('scope changes');
  await expect(page.getByRole('link', { name: 'Open app' })).toBeVisible();
});

test('dashboard placeholder renders', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
});
