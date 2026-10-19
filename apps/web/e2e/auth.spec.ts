import { test, expect } from '@playwright/test';

// Phase 2 flow: sign up (creates org via trigger) → dashboard → create project.
// Requires the local Supabase stack running (pnpm db:start).

test('sign up, land on dashboard, and create a project', async ({ page }) => {
  const unique = Date.now();
  const email = `e2e+${unique}@scopesignal.test`;

  await page.goto('/login');
  // Switch to sign-up mode.
  await page.getByRole('button', { name: 'Sign up' }).click();

  await page.getByLabel('Organization name').fill(`E2E Org ${unique}`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Create account' }).click();

  // Redirected into the authenticated app.
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect(page.getByText(`E2E Org ${unique}`)).toBeVisible();

  // Create a project.
  const projectName = `Westside Renovation ${unique}`;
  await page.getByRole('link', { name: 'New Project' }).first().click();
  await page.getByLabel('Project name').fill(projectName);
  await page.getByRole('button', { name: 'Create project' }).click();

  // Lands on the project detail page.
  await expect(page.getByRole('heading', { name: projectName })).toBeVisible();

  // And it shows up in the projects list.
  await page.getByRole('link', { name: 'Projects' }).first().click();
  await expect(page.getByRole('link', { name: new RegExp(projectName) })).toBeVisible();
});

test('unauthenticated access to a protected route redirects to login', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});
