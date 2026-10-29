import { expect, test } from '@playwright/test';

test.describe('Vehicle-Driver Assignment Lifecycle and Authorization Acceptance Flow', () => {
  test('exercises complete assignment lifecycle: pairing active vehicle & eligible driver, verifying bidirectional detail views, enforcing lifecycle guards, and ending assignment', async ({
    page,
  }) => {
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const timestamp = `${Date.now().toString().slice(-4)}${randomSuffix}`;
    const vehicleDisplayId = `V-ASN-${timestamp}`;
    const vehicleReg = `AS-${randomSuffix}AB`;
    const safeTag = timestamp
      .toUpperCase()
      .replace(/[^A-HJ-NPR-Z0-9]/g, 'X')
      .slice(-6)
      .padStart(6, '0');
    const vehicleVin = `1HGCR2F83HA${safeTag}`;

    const driverFirstName = 'Taylor';
    const driverLastName = `Driver-${timestamp}`;
    const employeeNumber = `EMP-${timestamp}`;
    const licenseNumber = `DL-${timestamp}`;

    // 1. Create and activate vehicle
    await page.goto('/vehicles/new');
    await expect(page).toHaveTitle(/Vehicle Management System/u);

    await page.getByTestId('input-display-id').fill(vehicleDisplayId);
    await page.getByTestId('input-registration').fill(vehicleReg);
    await page.getByTestId('input-vin').fill(vehicleVin);
    await page.getByTestId('input-model').fill('Playwright Fleet Van');
    await page.getByTestId('select-type').selectOption('VAN');
    await page.getByTestId('select-fuel-type').selectOption('DIESEL');
    await page.getByTestId('input-year').fill('2024');
    await page.getByTestId('input-odometer').fill('5000');
    await page.getByTestId('input-notes').fill('E2E vehicle for assignment testing');
    await page.getByTestId('submit-vehicle').click();

    await expect(page).toHaveURL(/\/vehicles\/[0-9a-f-]+/u);
    const vehicleUrl = page.url();
    const vehicleId = vehicleUrl.split('/').pop()!;

    // Activate vehicle
    await page.getByTestId('activate-vehicle-btn').click();
    await expect(page.getByTestId('detail-status')).toHaveText('ACTIVE');

    // 2. Create and activate driver with valid license
    await page.goto('/drivers/new');
    await page.getByTestId('first-name-input').fill(driverFirstName);
    await page.getByTestId('last-name-input').fill(driverLastName);
    await page.getByTestId('employee-number-input').fill(employeeNumber);
    await page.getByTestId('email-input').fill(`taylor.${timestamp}@example.test`);
    await page.getByTestId('phone-input').fill('+1-555-0199');
    await page.getByTestId('notes-input').fill('E2E driver for assignment testing');
    await page.getByTestId('submit-driver-button').click();

    await expect(page).toHaveURL(/\/drivers\/[0-9a-f-]+/u);
    const driverUrl = page.url();
    const driverId = driverUrl.split('/').pop()!;

    // Add valid license
    await page.getByTestId('add-license-button').click();
    await page.getByTestId('license-number-input').fill(licenseNumber);
    await page.getByTestId('license-country-input').fill('US');
    await page.getByTestId('license-region-input').fill('CA');
    await page.getByTestId('license-classes-input').fill('C');
    await page.getByTestId('license-issue-date-input').fill('2024-01-01');
    await page.getByTestId('license-expiry-date-input').fill('2030-01-01');
    await page.getByTestId('save-license-button').click();
    await expect(page.getByTestId('licenses-table')).toContainText(licenseNumber);

    // Activate driver -> ACTIVE and Eligible
    await page.getByTestId('activate-driver-button').click();
    await expect(page.getByTestId('driver-status-badge-active')).toBeVisible();
    await expect(page.getByTestId('driver-eligibility-badge')).toContainText('Eligible');

    // 3. Create Assignment
    await page.goto('/assignments');
    await expect(page.getByRole('heading', { name: 'Assignments', exact: true })).toBeVisible();

    const createLink = page.getByTestId('create-assignment-link');
    await expect(createLink).toBeVisible();
    await createLink.click();
    await expect(page).toHaveURL(/\/assignments\/new/u);
    await expect(
      page.getByRole('heading', { name: 'Create assignment', exact: true }),
    ).toBeVisible();

    // Select created vehicle & driver
    await page.getByTestId('vehicle-select').selectOption(vehicleId);
    await page.getByTestId('driver-select').selectOption(driverId);
    await page.getByTestId('notes-input').fill('E2E automated shift assignment');

    await page.getByTestId('submit-assignment-button').click();
    await expect(page).toHaveURL(/\/assignments\/[0-9a-f-]+/u);
    const assignmentUrl = page.url();
    const assignmentId = assignmentUrl.split('/').pop()!;

    // 4. Verify Assignment Detail
    await expect(page.getByTestId('assignment-status-badge-active')).toBeVisible();
    await expect(page.getByTestId('driver-eligibility-badge')).toContainText('Eligible');
    await expect(page.getByTestId('detail-vehicle')).toContainText(vehicleDisplayId);
    await expect(page.getByTestId('detail-driver')).toContainText(driverFirstName);
    await expect(page.getByTestId('detail-notes')).toHaveText('E2E automated shift assignment');
    await expect(page.getByTestId('detail-version')).toHaveText('1');

    // 5. Cross-Aggregate Lifecycle Guard on Vehicle
    await page.goto(`/vehicles/${vehicleId}`);
    await expect(page.getByTestId('current-assignment-card')).toBeVisible();
    await expect(page.getByTestId('assigned-driver-name')).toContainText(driverFirstName);
    await expect(page.getByTestId('assignment-status-badge')).toHaveText('ACTIVE');

    // Attempt vehicle retirement while actively assigned -> must fail
    await page.getByTestId('retire-vehicle-btn').click();
    await expect(page.getByTestId('retire-modal')).toBeVisible();
    await page.getByTestId('retire-reason-input').fill('Decommission attempt while assigned');
    await page.getByTestId('confirm-retire-btn').click();
    await expect(page.getByTestId('retire-error')).toContainText(
      'Cannot retire vehicle while it has an active driver assignment',
    );
    // Cancel retirement modal
    await page.getByRole('button', { name: 'Cancel' }).click();

    // 6. Cross-Aggregate Lifecycle Guard on Driver
    await page.goto(`/drivers/${driverId}`);
    await expect(page.getByTestId('current-assignment-card')).toBeVisible();
    await expect(page.getByTestId('assigned-vehicle-display')).toContainText(vehicleDisplayId);
    await expect(page.getByTestId('assignment-status-badge')).toHaveText('ACTIVE');

    // Attempt driver terminal deactivation while actively assigned -> must fail
    await page.getByTestId('deactivate-driver-button').click();
    await expect(page.getByTestId('deactivate-modal')).toBeVisible();
    await page.getByTestId('deactivate-reason-input').fill('Contract end attempt while assigned');
    await page.getByTestId('confirm-deactivate-button').click();
    await expect(page.getByTestId('action-error-banner')).toContainText(
      'Cannot deactivate driver while an active vehicle assignment exists',
    );
    // Cancel deactivation modal
    await page.getByRole('button', { name: 'Cancel' }).click();

    // Suspend Driver while assigned -> assignment remains ACTIVE, driver becomes Ineligible
    await page.getByTestId('suspend-driver-button').click();
    await expect(page.getByTestId('suspend-modal')).toBeVisible();
    await page.getByTestId('suspend-reason-input').fill('Temporary medical hold');
    await page.getByTestId('confirm-suspend-button').click();
    await expect(page.getByTestId('driver-status-badge-suspended')).toBeVisible();
    await expect(page.getByTestId('driver-eligibility-badge')).toContainText('Ineligible');
    await expect(page.getByTestId('current-assignment-card')).toBeVisible();
    await expect(page.getByTestId('assignment-status-badge')).toHaveText('ACTIVE');

    // Reactivate Driver where license remains valid
    await page.getByTestId('reactivate-driver-button').click();
    await expect(page.getByTestId('driver-status-badge-active')).toBeVisible();
    await expect(page.getByTestId('driver-eligibility-badge')).toContainText('Eligible');
    await expect(page.getByTestId('current-assignment-card')).toBeVisible();
    await expect(page.getByTestId('assignment-status-badge')).toHaveText('ACTIVE');

    // 7. End Assignment
    await page.goto(`/assignments/${assignmentId}`);
    await expect(page.getByTestId('assignment-status-badge-active')).toBeVisible();

    const endBtn = page.getByTestId('end-assignment-button');
    await expect(endBtn).toBeVisible();
    await endBtn.click();

    await expect(page.getByTestId('end-modal')).toBeVisible();
    await page.getByTestId('end-reason-input').fill('Shift concluded normally');
    await page.getByTestId('confirm-end-button').click();

    // Verify ENDED status
    await expect(page.getByTestId('assignment-status-badge-ended')).toBeVisible();
    await expect(page.getByTestId('detail-end-reason')).toHaveText('Shift concluded normally');
    await expect(page.getByTestId('detail-version')).toHaveText('2');

    // 8. Verify Guards Lifted on Vehicle and Driver
    await page.goto(`/vehicles/${vehicleId}`);
    await expect(page.getByTestId('no-active-assignment-text')).toBeVisible();
    await expect(page.getByTestId('assignment-history-table')).toContainText(driverFirstName);
    await expect(page.getByTestId('assignment-history-table')).toContainText('ENDED');

    await page.goto(`/drivers/${driverId}`);
    await expect(page.getByTestId('no-active-assignment-text')).toBeVisible();
    await expect(page.getByTestId('assignment-history-table')).toContainText(vehicleDisplayId);
    await expect(page.getByTestId('assignment-history-table')).toContainText('ENDED');
  });

  test('enforces RBAC permissions: viewer role cannot create or end assignments', async ({
    page,
  }) => {
    await page.goto('/assignments');
    await expect(page.getByRole('heading', { name: 'Assignments', exact: true })).toBeVisible();

    // Switch to Dev Viewer
    const switchViewerBtn = page.getByTestId('auth-viewer-btn');
    await expect(switchViewerBtn).toBeVisible();
    await switchViewerBtn.click();

    // Verify viewer status in tenant header
    await expect(page.getByTestId('user-badge')).toContainText('Development Viewer');

    // Verify Create assignment link is hidden for viewer
    await expect(page.getByTestId('create-assignment-link')).toHaveCount(0);

    // Open any assignment from the list if present
    const firstRowLink = page
      .locator('[data-testid="assignments-table"] tbody tr a.action-link')
      .first();
    const count = await firstRowLink.count();
    if (count > 0) {
      await firstRowLink.click();
      await expect(page).toHaveURL(/\/assignments\/[0-9a-f-]+/u);

      // Verify End assignment button is hidden for viewer
      await expect(page.getByTestId('end-assignment-button')).toHaveCount(0);
    }
  });
});
