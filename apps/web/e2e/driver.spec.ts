import { expect, test } from '@playwright/test';

test.describe('Driver Management Lifecycle and Authorization Acceptance Flow', () => {
  test('exercises complete driver lifecycle: creation, license addition, activation, suspension, reactivation, deactivation', async ({
    page,
  }) => {
    const timestamp = Date.now().toString().slice(-6);
    const firstName = 'Alex';
    const lastName = `Driver-${timestamp}`;
    const employeeNumber = `EMP-${timestamp}`;
    const licenseNumber = `DL-${timestamp}`;

    // 1. Authenticate dev admin and open drivers list
    await page.goto('/drivers');
    await expect(page).toHaveTitle(/Vehicle Management System/u);
    await expect(page.getByRole('heading', { name: 'Drivers', exact: true })).toBeVisible();

    // 2. Open Driver create page
    const createLink = page.getByTestId('create-driver-link');
    await expect(createLink).toBeVisible();
    await createLink.click();
    await expect(page).toHaveURL(/\/drivers\/new/u);
    await expect(page.getByRole('heading', { name: 'Create driver', exact: true })).toBeVisible();

    // 3. Fill in creation form
    await page.getByTestId('first-name-input').fill(firstName);
    await page.getByTestId('last-name-input').fill(lastName);
    await page.getByTestId('employee-number-input').fill(employeeNumber);
    await page.getByTestId('email-input').fill(`alex.${timestamp}@example.test`);
    await page.getByTestId('phone-input').fill('+1-555-0188');
    await page.getByTestId('notes-input').fill('E2E automated acceptance test intake');

    // 4. Submit form and verify navigation to detail page
    await page.getByTestId('submit-driver-button').click();
    await expect(page).toHaveURL(/\/drivers\/[0-9a-f-]+/u);

    // 5. Verify driver detail in DRAFT status and Ineligible
    await expect(page.getByTestId('driver-status-badge-draft')).toBeVisible();
    await expect(page.getByTestId('driver-eligibility-badge')).toContainText('Ineligible');
    await expect(page.getByTestId('detail-employee-number')).toHaveText(employeeNumber);
    await expect(page.getByTestId('detail-version')).toHaveText('1');

    // 6. Attempt activation without license -> expect failure / error notice
    const activateBtn = page.getByTestId('activate-driver-button');
    await expect(activateBtn).toBeVisible();
    await activateBtn.click();
    await expect(page.getByTestId('action-error-banner')).toContainText('Cannot activate driver');

    // 7. Add valid license
    await page.getByTestId('add-license-button').click();
    await expect(page.getByTestId('add-license-form')).toBeVisible();

    await page.getByTestId('license-number-input').fill(licenseNumber);
    await page.getByTestId('license-country-input').fill('US');
    await page.getByTestId('license-region-input').fill('NY');
    await page.getByTestId('license-classes-input').fill('B, C');
    await page.getByTestId('license-issue-date-input').fill('2024-01-01');
    await page.getByTestId('license-expiry-date-input').fill('2030-01-01');
    await page.getByTestId('save-license-button').click();

    // Verify license appears in table as Valid
    await expect(page.getByTestId('licenses-table')).toContainText(licenseNumber);
    await expect(page.getByTestId('licenses-table')).toContainText('Valid');

    // 8. Now activate driver -> status ACTIVE and Eligible
    await page.getByTestId('activate-driver-button').click();
    await expect(page.getByTestId('driver-status-badge-active')).toBeVisible();
    await expect(page.getByTestId('driver-eligibility-badge')).toContainText('Eligible');
    await expect(page.getByTestId('detail-version')).toHaveText('2');

    // 9. Suspend driver
    await page.getByTestId('suspend-driver-button').click();
    await expect(page.getByTestId('suspend-modal')).toBeVisible();
    await page.getByTestId('suspend-reason-input').fill('Annual medical evaluation');
    await page.getByTestId('confirm-suspend-button').click();

    // Verify SUSPENDED status and Ineligible
    await expect(page.getByTestId('driver-status-badge-suspended')).toBeVisible();
    await expect(page.getByTestId('driver-eligibility-badge')).toContainText('Ineligible');
    await expect(page.getByTestId('detail-version')).toHaveText('3');

    // 10. Reactivate driver
    await page.getByTestId('reactivate-driver-button').click();
    await expect(page.getByTestId('driver-status-badge-active')).toBeVisible();
    await expect(page.getByTestId('driver-eligibility-badge')).toContainText('Eligible');
    await expect(page.getByTestId('detail-version')).toHaveText('4');

    // 11. Deactivate driver (terminal)
    await page.getByTestId('deactivate-driver-button').click();
    await expect(page.getByTestId('deactivate-modal')).toBeVisible();
    await page.getByTestId('deactivate-reason-input').fill('Contract completed');
    await page.getByTestId('confirm-deactivate-button').click();

    // Verify INACTIVE terminal status
    await expect(page.getByTestId('driver-status-badge-inactive')).toBeVisible();
    await expect(page.getByTestId('driver-eligibility-badge')).toContainText('Ineligible');
    await expect(page.getByText('Driver is permanently deactivated')).toBeVisible();
    await expect(page.getByTestId('detail-version')).toHaveText('5');

    // Verify lifecycle status history contains transitions
    await expect(page.getByTestId('driver-history-list')).toContainText('ACTIVE → SUSPENDED');
    await expect(page.getByTestId('driver-history-list')).toContainText('SUSPENDED → ACTIVE');
    await expect(page.getByTestId('driver-history-list')).toContainText('ACTIVE → INACTIVE');
  });

  test('enforces RBAC permissions: viewer role cannot create or mutate drivers', async ({
    page,
  }) => {
    await page.goto('/drivers');
    await expect(page.getByRole('heading', { name: 'Drivers', exact: true })).toBeVisible();

    // Switch to Dev Viewer
    const switchViewerBtn = page.getByTestId('auth-viewer-btn');
    await expect(switchViewerBtn).toBeVisible();
    await switchViewerBtn.click();

    // Verify viewer status in tenant header
    await expect(page.getByTestId('user-badge')).toContainText('Development Viewer');

    // Verify Create driver link is hidden for viewer
    await expect(page.getByTestId('create-driver-link')).toHaveCount(0);

    // Open any driver from the list if present
    const firstRowLink = page.locator('[data-testid="drivers-table"] tbody tr a').first();
    const count = await firstRowLink.count();
    if (count > 0) {
      await firstRowLink.click();
      await expect(page).toHaveURL(/\/drivers\/[0-9a-f-]+/u);

      // Verify mutation buttons are hidden for viewer
      await expect(page.getByTestId('edit-driver-button')).toHaveCount(0);
      await expect(page.getByTestId('activate-driver-button')).toHaveCount(0);
      await expect(page.getByTestId('suspend-driver-button')).toHaveCount(0);
      await expect(page.getByTestId('deactivate-driver-button')).toHaveCount(0);
      await expect(page.getByTestId('add-license-button')).toHaveCount(0);

      // History should still be visible (viewer has driver.history.read)
      await expect(page.getByTestId('driver-history-list')).toBeVisible();
    }
  });
});
