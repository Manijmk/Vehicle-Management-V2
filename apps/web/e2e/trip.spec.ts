import { expect, test } from '@playwright/test';

test.describe('Trip Lifecycle, Operations, and Fleet Integration Acceptance Flow', () => {
  test('exercises complete trip lifecycle: planning DRAFT, transition to READY, START with odometer, verify vehicle & driver in-progress state, verify assignment end is guarded, COMPLETE with end odometer, verify vehicle authoritative odometer progression, and verify assignment end is unblocked', async ({
    page,
  }) => {
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const timestamp = `${Date.now().toString().slice(-4)}${randomSuffix}`;
    const vehicleDisplayId = `V-TRP-${timestamp}`;
    const vehicleReg = `TR-${randomSuffix}XY`;
    const safeTag = timestamp
      .toUpperCase()
      .replace(/[^A-HJ-NPR-Z0-9]/g, 'X')
      .slice(-6)
      .padStart(6, '0');
    const vehicleVin = `1HGCR2F83HA${safeTag}`;

    const driverFirstName = 'Morgan';
    const driverLastName = `TripDriver-${timestamp}`;
    const employeeNumber = `EMP-T-${timestamp}`;
    const licenseNumber = `DL-T-${timestamp}`;

    // 1. Create and activate vehicle with initial odometer = 10,000 km
    await page.goto('/vehicles/new');
    await expect(page).toHaveTitle(/Vehicle Management System/u);

    await page.getByTestId('input-display-id').fill(vehicleDisplayId);
    await page.getByTestId('input-registration').fill(vehicleReg);
    await page.getByTestId('input-vin').fill(vehicleVin);
    await page.getByTestId('input-model').fill('Playwright Trip Cargo Van');
    await page.getByTestId('select-type').selectOption('VAN');
    await page.getByTestId('select-fuel-type').selectOption('DIESEL');
    await page.getByTestId('input-year').fill('2024');
    await page.getByTestId('input-odometer').fill('10000');
    await page.getByTestId('input-notes').fill('Vehicle for E2E trip testing');
    await page.getByTestId('submit-vehicle').click();

    await expect(page).toHaveURL(/\/vehicles\/[0-9a-f-]+/u);
    const vehicleUrl = page.url();
    const vehicleId = vehicleUrl.split('/').pop()!;

    // Activate vehicle
    await page.getByTestId('activate-vehicle-btn').click();
    await expect(page.getByTestId('detail-status')).toHaveText('ACTIVE');

    // 2. Create and activate driver with valid qualifying license
    await page.goto('/drivers/new');
    await page.getByTestId('first-name-input').fill(driverFirstName);
    await page.getByTestId('last-name-input').fill(driverLastName);
    await page.getByTestId('employee-number-input').fill(employeeNumber);
    await page.getByTestId('email-input').fill(`morgan.${timestamp}@example.test`);
    await page.getByTestId('phone-input').fill('+1-555-0299');
    await page.getByTestId('notes-input').fill('Driver for E2E trip testing');
    await page.getByTestId('submit-driver-button').click();

    await expect(page).toHaveURL(/\/drivers\/[0-9a-f-]+/u);
    const driverUrl = page.url();
    const driverId = driverUrl.split('/').pop()!;

    // Add valid qualifying license
    await page.getByTestId('add-license-button').click();
    await page.getByTestId('license-number-input').fill(licenseNumber);
    await page.getByTestId('license-country-input').fill('US');
    await page.getByTestId('license-region-input').fill('CA');
    await page.getByTestId('license-classes-input').fill('B');
    await page.getByTestId('license-issue-date-input').fill('2024-01-01');
    await page.getByTestId('license-expiry-date-input').fill('2030-01-01');
    await page.getByTestId('save-license-button').click();
    await expect(page.getByTestId('licenses-table')).toContainText(licenseNumber);

    // Activate driver
    await page.getByTestId('activate-driver-button').click();
    await expect(page.getByTestId('driver-status-badge-active')).toBeVisible();
    await expect(page.getByTestId('driver-eligibility-badge')).toContainText('Eligible');

    // 3. Create active assignment pairing vehicle and driver
    await page.goto('/assignments/new');
    await page.getByTestId('vehicle-select').selectOption(vehicleId);
    await page.getByTestId('driver-select').selectOption(driverId);
    await page.getByTestId('notes-input').fill('Assignment for E2E trip slice');
    await page.getByTestId('submit-assignment-button').click();

    await expect(page).toHaveURL(/\/assignments\/[0-9a-f-]+/u);
    const assignmentUrl = page.url();
    const assignmentId = assignmentUrl.split('/').pop()!;
    await expect(page.getByTestId('assignment-status-badge-active')).toBeVisible();

    // 4. Plan new trip from Trips page
    await page.goto('/trips');
    await expect(page.getByRole('heading', { name: 'Trips', exact: true })).toBeVisible();

    const planLink = page.getByTestId('create-trip-link');
    await expect(planLink).toBeVisible();
    await planLink.click();

    await expect(page).toHaveURL(/\/trips\/new/u);
    await expect(page.getByRole('heading', { name: 'Plan new trip', exact: true })).toBeVisible();

    // Select the assignment and enter trip route
    await page.getByTestId('assignment-select').selectOption(assignmentId);
    await page.getByTestId('origin-input').fill('South Logistics Depot');
    await page.getByTestId('destination-input').fill('North Distribution Center');
    await page.getByTestId('purpose-input').fill('Regional Parts Haul');
    await page.getByTestId('notes-input').fill('Fragile electronics cargo on board');

    await page.getByTestId('submit-trip-btn').click();

    // 5. Verify DRAFT Trip Detail
    await expect(page).toHaveURL(/\/trips\/[0-9a-f-]+/u);
    const tripUrl = page.url();
    const tripId = tripUrl.split('/').pop()!;

    await expect(page.getByTestId('trip-status')).toHaveText('DRAFT');
    await expect(page.getByTestId('trip-origin')).toHaveText('South Logistics Depot');
    await expect(page.getByTestId('trip-destination')).toHaveText('North Distribution Center');
    await expect(page.getByTestId('trip-start-odo')).toContainText('Pending departure');

    // 6. Transition DRAFT -> READY
    const readyBtn = page.getByTestId('mark-ready-btn');
    await expect(readyBtn).toBeVisible();
    await readyBtn.click();
    await expect(page.getByTestId('trip-status')).toHaveText('READY');

    // Milestone 6: Pre-Trip Inspection Gate - perform passing pre-trip inspection
    await expect(page.getByTestId('pre-trip-gate-card')).toBeVisible();
    await page.getByTestId('start-pre-trip-inspection-btn').click();
    await expect(page).toHaveURL(/\/inspections\/new/u);
    await page.getByTestId('submit-inspection-button').click();
    await expect(page).toHaveURL(/\/inspections\/[0-9a-f-]+/u);

    // Start inspection
    await page.getByTestId('start-inspection-button').click();
    // Complete inspection
    await page.getByTestId('complete-inspection-button').click();
    await expect(page.getByTestId('inspection-result-badge')).toHaveText('PASS');

    // Return to trip detail
    await page.goto(`/trips/${tripId}`);
    await expect(page.getByTestId('pre-trip-gate-card')).toContainText('Pre-Trip Inspection: PASS');

    // 7. Transition READY -> IN_PROGRESS with odometer
    const startBtn = page.getByTestId('start-trip-btn');
    await expect(startBtn).toBeVisible();
    await startBtn.click();

    const startModal = page.getByTestId('start-modal');
    await expect(startModal).toBeVisible();
    // Start odometer is prefilled with 10000
    await page.getByTestId('confirm-start-btn').click();

    await expect(page.getByTestId('trip-status')).toHaveText('IN_PROGRESS');
    await expect(page.getByTestId('trip-start-odo')).toHaveText('10000 km');
    await expect(page.getByTestId('trip-actual-start')).not.toHaveText('—');

    // 8. Verify Bidirectional Fleet Integrations
    // Check Vehicle detail shows current in-progress trip
    await page.goto(`/vehicles/${vehicleId}`);
    await expect(page.getByTestId('current-trip-card')).toBeVisible();
    await expect(page.getByTestId('current-trip-status')).toHaveText('IN_PROGRESS');
    await expect(page.getByTestId('current-trip-route')).toContainText('South Logistics Depot');

    // Check Driver detail shows current in-progress trip
    await page.goto(`/drivers/${driverId}`);
    await expect(page.getByTestId('current-trip-card')).toBeVisible();
    await expect(page.getByTestId('current-trip-status')).toHaveText('IN_PROGRESS');

    // Check Assignment detail shows active trip warning and blocks ending assignment
    await page.goto(`/assignments/${assignmentId}`);
    await expect(page.getByTestId('active-trip-warning')).toBeVisible();

    await page.getByTestId('end-assignment-button').click();
    await expect(page.getByTestId('end-modal')).toBeVisible();
    await page.getByTestId('end-reason-input').fill('Attempting early end during trip');
    await page.getByTestId('confirm-end-button').click();

    // Guard rejects ending assignment!
    await expect(page.getByTestId('end-error-banner')).toContainText(
      'Cannot end assignment while a non-terminal trip exists',
    );
    await page.getByTestId('cancel-end-button').click();

    // 9. Complete the trip
    await page.goto(`/trips/${tripId}`);

    // Milestone 6: Post-Trip Inspection Gate - perform post-trip inspection
    await expect(page.getByTestId('post-trip-gate-card')).toBeVisible();
    await page.getByTestId('start-post-trip-inspection-btn').click();
    await expect(page).toHaveURL(/\/inspections\/new/u);
    await page.getByTestId('submit-inspection-button').click();
    await expect(page).toHaveURL(/\/inspections\/[0-9a-f-]+/u);

    // Start inspection
    await page.getByTestId('start-inspection-button').click();
    // Complete inspection
    await page.getByTestId('complete-inspection-button').click();
    await expect(page.getByTestId('inspection-status-badge')).toHaveText('COMPLETED');

    // Return to trip detail
    await page.goto(`/trips/${tripId}`);
    await expect(page.getByTestId('post-trip-gate-card')).toContainText(
      'Post-Trip Inspection Completed',
    );

    const completeBtn = page.getByTestId('complete-trip-btn');
    await expect(completeBtn).toBeVisible();
    await completeBtn.click();

    const completeModal = page.getByTestId('complete-modal');
    await expect(completeModal).toBeVisible();
    await page.getByTestId('end-odometer-input').fill('10220');
    await page.getByTestId('complete-notes-input').fill('Delivered safely without delays');
    await page.getByTestId('confirm-complete-btn').click();

    // 10. Verify Trip Completion Details
    await expect(page.getByTestId('trip-status')).toHaveText('COMPLETED');
    await expect(page.getByTestId('trip-end-odo')).toHaveText('10220 km');
    await expect(page.getByTestId('trip-distance')).toHaveText('220 km');
    await expect(page.getByTestId('trip-actual-end')).not.toHaveText('—');

    // Status history table has all 4 lifecycle transitions
    const historyTable = page.getByTestId('trip-history-table');
    await expect(historyTable).toContainText('DRAFT');
    await expect(historyTable).toContainText('READY');
    await expect(historyTable).toContainText('IN_PROGRESS');
    await expect(historyTable).toContainText('COMPLETED');

    // 11. Verify Vehicle Authoritative Odometer Updated
    await page.goto(`/vehicles/${vehicleId}`);
    await expect(page.getByTestId('detail-odometer')).toHaveText('10,220 km');
    await expect(page.getByTestId('no-active-trip-text')).toBeVisible();

    // 12. Verify Assignment can now be ended successfully
    await page.goto(`/assignments/${assignmentId}`);
    await expect(page.getByTestId('active-trip-warning')).not.toBeVisible();

    await page.getByTestId('end-assignment-button').click();
    await expect(page.getByTestId('end-modal')).toBeVisible();
    await page.getByTestId('end-reason-input').fill('Trip concluded, shift ended normally');
    await page.getByTestId('confirm-end-button').click();

    await expect(page.getByTestId('assignment-status-badge-ended')).toBeVisible();
  });

  test('cancels a planned trip from DRAFT and verifies terminal state without odometer modification', async ({
    page,
  }) => {
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const timestamp = `${Date.now().toString().slice(-4)}${randomSuffix}`;

    // Create active vehicle
    await page.goto('/vehicles/new');
    await page.getByTestId('input-display-id').fill(`V-CN-${timestamp}`);
    await page.getByTestId('input-registration').fill(`CN-${randomSuffix}`);
    const safeTag = timestamp
      .toUpperCase()
      .replace(/[^A-HJ-NPR-Z0-9]/g, 'X')
      .slice(-6)
      .padStart(6, '0');
    await page.getByTestId('input-vin').fill(`1HGCR2F83HA${safeTag}`);
    await page.getByTestId('input-model').fill('Cancel Test Van');
    await page.getByTestId('select-type').selectOption('VAN');
    await page.getByTestId('select-fuel-type').selectOption('PETROL');
    await page.getByTestId('input-year').fill('2024');
    await page.getByTestId('input-odometer').fill('20000');
    await page.getByTestId('submit-vehicle').click();
    await expect(page).toHaveURL(/\/vehicles\/[0-9a-f-]+/u);
    const vehicleId = page.url().split('/').pop()!;
    await page.getByTestId('activate-vehicle-btn').click();
    await expect(page.getByTestId('detail-status')).toHaveText('ACTIVE');

    // Create active driver
    await page.goto('/drivers/new');
    await page.getByTestId('first-name-input').fill('Sam');
    await page.getByTestId('last-name-input').fill(`CancelDriver-${timestamp}`);
    await page.getByTestId('employee-number-input').fill(`EMP-CN-${timestamp}`);
    await page.getByTestId('submit-driver-button').click();
    await expect(page).toHaveURL(/\/drivers\/[0-9a-f-]+/u);
    const driverId = page.url().split('/').pop()!;

    await page.getByTestId('add-license-button').click();
    await page.getByTestId('license-number-input').fill(`DL-CN-${timestamp}`);
    await page.getByTestId('license-country-input').fill('US');
    await page.getByTestId('license-region-input').fill('TX');
    await page.getByTestId('license-classes-input').fill('C');
    await page.getByTestId('license-issue-date-input').fill('2024-01-01');
    await page.getByTestId('license-expiry-date-input').fill('2030-01-01');
    await page.getByTestId('save-license-button').click();
    await page.getByTestId('activate-driver-button').click();
    await expect(page.getByTestId('driver-status-badge-active')).toBeVisible();

    // Create assignment
    await page.goto('/assignments/new');
    await page.getByTestId('vehicle-select').selectOption(vehicleId);
    await page.getByTestId('driver-select').selectOption(driverId);
    await page.getByTestId('submit-assignment-button').click();
    await expect(page).toHaveURL(/\/assignments\/[0-9a-f-]+/u);
    const assignmentId = page.url().split('/').pop()!;

    // Create trip
    await page.goto('/trips/new');
    await page.getByTestId('assignment-select').selectOption(assignmentId);
    await page.getByTestId('origin-input').fill('Depot Alpha');
    await page.getByTestId('destination-input').fill('Site Beta');
    await page.getByTestId('submit-trip-btn').click();
    await expect(page).toHaveURL(/\/trips\/[0-9a-f-]+/u);
    await expect(page.getByTestId('trip-status')).toHaveText('DRAFT');

    // Cancel trip
    await page.getByTestId('cancel-trip-btn').click();
    await expect(page.getByTestId('cancel-modal')).toBeVisible();
    await page.getByTestId('cancel-reason-input').fill('Order cancelled by customer');
    await page.getByTestId('confirm-cancel-btn').click();

    await expect(page.getByTestId('trip-status')).toHaveText('CANCELLED');
    await expect(page.getByTestId('trip-cancel-reason')).toHaveText('Order cancelled by customer');

    // Verify vehicle odometer was not modified
    await page.goto(`/vehicles/${vehicleId}`);
    await expect(page.getByTestId('detail-odometer')).toHaveText('20,000 km');
  });

  test('aborts an IN_PROGRESS trip with partial odometer and reason, verifying vehicle odometer progression', async ({
    page,
  }) => {
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const timestamp = `${Date.now().toString().slice(-4)}${randomSuffix}`;

    // Create vehicle (odometer 30,000)
    await page.goto('/vehicles/new');
    await page.getByTestId('input-display-id').fill(`V-AB-${timestamp}`);
    await page.getByTestId('input-registration').fill(`AB-${randomSuffix}`);
    const safeTag = timestamp
      .toUpperCase()
      .replace(/[^A-HJ-NPR-Z0-9]/g, 'X')
      .slice(-6)
      .padStart(6, '0');
    await page.getByTestId('input-vin').fill(`1HGCR2F83HA${safeTag}`);
    await page.getByTestId('input-model').fill('Abort Test Truck');
    await page.getByTestId('select-type').selectOption('TRUCK');
    await page.getByTestId('select-fuel-type').selectOption('DIESEL');
    await page.getByTestId('input-year').fill('2024');
    await page.getByTestId('input-odometer').fill('30000');
    await page.getByTestId('submit-vehicle').click();
    await expect(page).toHaveURL(/\/vehicles\/[0-9a-f-]+/u);
    const vehicleId = page.url().split('/').pop()!;
    await page.getByTestId('activate-vehicle-btn').click();
    await expect(page.getByTestId('detail-status')).toHaveText('ACTIVE');

    // Create driver
    await page.goto('/drivers/new');
    await page.getByTestId('first-name-input').fill('Alex');
    await page.getByTestId('last-name-input').fill(`AbortDriver-${timestamp}`);
    await page.getByTestId('employee-number-input').fill(`EMP-AB-${timestamp}`);
    await page.getByTestId('submit-driver-button').click();
    await expect(page).toHaveURL(/\/drivers\/[0-9a-f-]+/u);
    const driverId = page.url().split('/').pop()!;

    await page.getByTestId('add-license-button').click();
    await page.getByTestId('license-number-input').fill(`DL-AB-${timestamp}`);
    await page.getByTestId('license-country-input').fill('US');
    await page.getByTestId('license-region-input').fill('NY');
    await page.getByTestId('license-classes-input').fill('B');
    await page.getByTestId('license-issue-date-input').fill('2024-01-01');
    await page.getByTestId('license-expiry-date-input').fill('2030-01-01');
    await page.getByTestId('save-license-button').click();
    await page.getByTestId('activate-driver-button').click();
    await expect(page.getByTestId('driver-status-badge-active')).toBeVisible();

    // Create assignment
    await page.goto('/assignments/new');
    await page.getByTestId('vehicle-select').selectOption(vehicleId);
    await page.getByTestId('driver-select').selectOption(driverId);
    await page.getByTestId('submit-assignment-button').click();
    await expect(page).toHaveURL(/\/assignments\/[0-9a-f-]+/u);
    const assignmentId = page.url().split('/').pop()!;

    // Create, ready, and start trip
    await page.goto('/trips/new');
    await page.getByTestId('assignment-select').selectOption(assignmentId);
    await page.getByTestId('origin-input').fill('Highway Depot 1');
    await page.getByTestId('destination-input').fill('Highway Depot 2');
    await page.getByTestId('submit-trip-btn').click();
    await expect(page).toHaveURL(/\/trips\/[0-9a-f-]+/u);
    const tripId = page.url().split('/').pop()!;
    await page.getByTestId('mark-ready-btn').click();
    await expect(page.getByTestId('trip-status')).toHaveText('READY');

    // Milestone 6: Pre-Trip Inspection Gate
    await page.getByTestId('start-pre-trip-inspection-btn').click();
    await expect(page).toHaveURL(/\/inspections\/new/u);
    await page.getByTestId('submit-inspection-button').click();
    await expect(page).toHaveURL(/\/inspections\/[0-9a-f-]+/u);
    await page.getByTestId('start-inspection-button').click();
    await page.getByTestId('complete-inspection-button').click();
    await expect(page.getByTestId('inspection-result-badge')).toHaveText('PASS');
    await page.goto(`/trips/${tripId}`);
    await expect(page.getByTestId('pre-trip-gate-card')).toContainText('Pre-Trip Inspection: PASS');

    await page.getByTestId('start-trip-btn').click();
    await page.getByTestId('confirm-start-btn').click();
    await expect(page.getByTestId('trip-status')).toHaveText('IN_PROGRESS');

    // Abort trip
    await page.getByTestId('abort-trip-btn').click();
    await expect(page.getByTestId('abort-modal')).toBeVisible();
    await page.getByTestId('abort-odometer-input').fill('30075');
    await page.getByTestId('abort-reason-input').fill('Mechanical alternator breakdown');
    await page.getByTestId('confirm-abort-btn').click();

    await expect(page.getByTestId('trip-status')).toHaveText('ABORTED');
    await expect(page.getByTestId('trip-end-odo')).toHaveText('30075 km');
    await expect(page.getByTestId('trip-distance')).toHaveText('75 km');
    await expect(page.getByTestId('trip-abort-reason')).toHaveText(
      'Mechanical alternator breakdown',
    );

    // Vehicle odometer updated to 30075 km
    await page.goto(`/vehicles/${vehicleId}`);
    await expect(page.getByTestId('detail-odometer')).toHaveText('30,075 km');
    await expect(page.getByTestId('no-active-trip-text')).toBeVisible();
  });

  test('enforces RBAC permissions: Dev Viewer can view trips list and details, but action buttons are hidden', async ({
    page,
  }) => {
    // 1. Switch to Dev Viewer
    await page.goto('/trips');
    await page.getByTestId('auth-viewer-btn').click();
    await expect(page.getByTestId('user-badge')).toContainText('Viewer');

    // 2. Verify Create Trip button is NOT visible for viewer
    await expect(page.getByTestId('create-trip-link')).not.toBeVisible();

    // 3. Navigate to a trip if available, or verify table is visible
    const table = page.getByTestId('trips-table');
    if (await table.isVisible()) {
      const firstTripLink = page.locator('[data-testid^="trip-link-"]').first();
      if (await firstTripLink.isVisible()) {
        await firstTripLink.click();
        await expect(page.getByTestId('trip-display-id')).toBeVisible();

        // Mutation buttons must NOT be present
        await expect(page.getByTestId('mark-ready-btn')).not.toBeVisible();
        await expect(page.getByTestId('start-trip-btn')).not.toBeVisible();
        await expect(page.getByTestId('complete-trip-btn')).not.toBeVisible();
        await expect(page.getByTestId('cancel-trip-btn')).not.toBeVisible();
        await expect(page.getByTestId('abort-trip-btn')).not.toBeVisible();
      }
    }

    // Switch back to Dev Admin
    await page.getByTestId('auth-admin-btn').click();
    await expect(page.getByTestId('user-badge')).toContainText('Admin');
  });
});
