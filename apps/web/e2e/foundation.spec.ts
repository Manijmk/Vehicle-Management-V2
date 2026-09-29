import { expect, test } from '@playwright/test';

test('shows the foundation shell', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle('Vehicle Management System');
  await expect(
    page.getByRole('heading', {
      name: 'Fleet operations, built on a dependable foundation.',
    }),
  ).toBeVisible();
  await expect(page.getByRole('status')).toHaveText(/Foundation ready/u);
});
