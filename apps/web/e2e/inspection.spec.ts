import { expect, test } from '@playwright/test';

test.describe('Milestone 6: Inspection Vertical Slice Acceptance Flow', () => {
  test('exercises complete template lifecycle: create DRAFT, activate, verify immutable lock, and archive', async ({
    page,
  }) => {
    const timestamp = Date.now().toString().slice(-6);
    const templateName = `Safety Audit Template ${timestamp}`;

    // 1. Navigate to templates and create new template
    await page.goto('/inspection-templates');
    await expect(page).toHaveTitle(/Vehicle Management System/u);
    await expect(page.getByTestId('inspection-templates-title')).toBeVisible();

    await page.getByTestId('new-template-button').click();
    await expect(page).toHaveURL(/\/inspection-templates\/new/u);

    await page.getByTestId('template-name-input').fill(templateName);
    await page
      .getByTestId('template-description-input')
      .fill('Comprehensive periodic safety checklist');
    await page.getByTestId('template-type-select').selectOption('SAFETY');

    // Fill first item (CRITICAL)
    await page.getByTestId('item-category-0').fill('Braking System');
    await page.getByTestId('item-prompt-0').fill('Check brake fluid level and hydraulic lines');
    await page.getByTestId('item-severity-0').selectOption('CRITICAL');

    // Add second item (NORMAL)
    await page.getByTestId('add-item-button').click();
    await page.getByTestId('item-category-1').fill('Windshield');
    await page.getByTestId('item-prompt-1').fill('Inspect wiper blades and fluid');
    await page.getByTestId('item-severity-1').selectOption('NORMAL');

    // Submit template
    await page.getByTestId('submit-template-button').click();
    await expect(page).toHaveURL(/\/inspection-templates\/[0-9a-f-]+/u);

    // 2. Verify DRAFT template detail
    await expect(page.getByTestId('template-name')).toHaveText(templateName);
    await expect(page.getByTestId('template-status-badge')).toHaveText('DRAFT');
    await expect(page.getByTestId('template-items-table')).toContainText('Braking System');
    await expect(page.getByTestId('template-items-table')).toContainText('Windshield');

    // 3. Activate template
    await page.getByTestId('activate-template-btn').click();
    await expect(page.getByTestId('template-status-badge')).toHaveText('ACTIVE');

    // Verify locked banner is visible
    await expect(page.getByTestId('template-locked-banner')).toContainText('immutable');
    await expect(page.getByTestId('activate-template-btn')).not.toBeVisible();

    // 4. Archive template
    await page.getByTestId('archive-template-btn').click();
    await expect(page.getByTestId('template-status-badge')).toHaveText('ARCHIVED');
    await expect(page.getByTestId('archive-template-btn')).not.toBeVisible();
  });

  test('exercises complete Pre-Trip and Post-Trip Inspection gates on a Trip: gating, defect detection, passing re-inspection, trip departure, post-trip inspection, and completion', async ({
    page,
  }) => {
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const timestamp = `${Date.now().toString().slice(-4)}${randomSuffix}`;
    const vehicleDisplayId = `V-INSP-${timestamp}`;
    const vehicleReg = `IN-${randomSuffix}ZX`;
    const safeTag = timestamp
      .toUpperCase()
      .replace(/[^A-HJ-NPR-Z0-9]/g, 'X')
      .slice(-6)
      .padStart(6, '0');
    const vehicleVin = `1HGCR2F83HA${safeTag}`;

    // 1. Create and activate vehicle
    await page.goto('/vehicles/new');
    await page.getByTestId('input-display-id').fill(vehicleDisplayId);
    await page.getByTestId('input-registration').fill(vehicleReg);
    await page.getByTestId('input-vin').fill(vehicleVin);
    await page.getByTestId('input-model').fill('Playwright Inspection Fleet');
    await page.getByTestId('select-type').selectOption('VAN');
    await page.getByTestId('select-fuel-type').selectOption('DIESEL');
    await page.getByTestId('input-year').fill('2024');
    await page.getByTestId('input-odometer').fill('15000');
    await page.getByTestId('submit-vehicle').click();
    await expect(page).toHaveURL(/\/vehicles\/[0-9a-f-]+/u);
    const vehicleId = page.url().split('/').pop()!;
    await page.getByTestId('activate-vehicle-btn').click();
    await expect(page.getByTestId('detail-status')).toHaveText('ACTIVE');

    // 2. Create and activate driver
    await page.goto('/drivers/new');
    await page.getByTestId('first-name-input').fill('Jordan');
    await page.getByTestId('last-name-input').fill(`InspDriver-${timestamp}`);
    await page.getByTestId('employee-number-input').fill(`EMP-I-${timestamp}`);
    await page.getByTestId('submit-driver-button').click();
    await expect(page).toHaveURL(/\/drivers\/[0-9a-f-]+/u);
    const driverId = page.url().split('/').pop()!;

    await page.getByTestId('add-license-button').click();
    await page.getByTestId('license-number-input').fill(`DL-I-${timestamp}`);
    await page.getByTestId('license-country-input').fill('US');
    await page.getByTestId('license-region-input').fill('CA');
    await page.getByTestId('license-classes-input').fill('B');
    await page.getByTestId('license-issue-date-input').fill('2024-01-01');
    await page.getByTestId('license-expiry-date-input').fill('2030-01-01');
    await page.getByTestId('save-license-button').click();
    await page.getByTestId('activate-driver-button').click();
    await expect(page.getByTestId('driver-status-badge-active')).toBeVisible();

    // 3. Create active assignment
    await page.goto('/assignments/new');
    await page.getByTestId('vehicle-select').selectOption(vehicleId);
    await page.getByTestId('driver-select').selectOption(driverId);
    await page.getByTestId('submit-assignment-button').click();
    await expect(page).toHaveURL(/\/assignments\/[0-9a-f-]+/u);
    const assignmentId = page.url().split('/').pop()!;

    // 4. Plan new trip and transition to READY
    await page.goto('/trips/new');
    await page.getByTestId('assignment-select').selectOption(assignmentId);
    await page.getByTestId('origin-input').fill('Inspection Base');
    await page.getByTestId('destination-input').fill('Terminal B');
    await page.getByTestId('submit-trip-btn').click();
    await expect(page).toHaveURL(/\/trips\/[0-9a-f-]+/u);
    const tripId = page.url().split('/').pop()!;

    await page.getByTestId('mark-ready-btn').click();
    await expect(page.getByTestId('trip-status')).toHaveText('READY');

    // 5. Verify Pre-Trip gate card is displayed
    await expect(page.getByTestId('pre-trip-gate-card')).toContainText(
      'Pre-Trip Inspection Required',
    );

    // 6. Perform a failing pre-trip inspection (defect detection)
    await page.getByTestId('start-pre-trip-inspection-btn').click();
    await expect(page).toHaveURL(/\/inspections\/new/u);
    await page.getByTestId('submit-inspection-button').click();
    await expect(page).toHaveURL(/\/inspections\/[0-9a-f-]+/u);

    // Start inspection
    await page.getByTestId('start-inspection-button').click();
    await expect(page.getByTestId('inspection-status-badge')).toHaveText('IN_PROGRESS');

    // Find the critical braking item or first radio fail button and mark it FAIL
    const firstFailRadio = page.locator('input[type="radio"][value="FAIL"]').first();
    await firstFailRadio.check();
    const firstCommentInput = page.locator('input[data-testid^="response-comment-"]').first();
    await firstCommentInput.fill('Severe brake fluid leak detected under master cylinder');

    // Complete inspection
    await page.getByTestId('complete-inspection-button').click();
    await expect(page.getByTestId('inspection-status-badge')).toHaveText('COMPLETED');
    await expect(page.getByTestId('inspection-result-badge')).toHaveText('FAIL');

    // 7. Return to trip and verify Pre-Trip Gate is blocked by the failed inspection
    await page.goto(`/trips/${tripId}`);
    await expect(page.getByTestId('pre-trip-gate-card')).toContainText(
      'Pre-Trip Inspection: FAILED',
    );
    await expect(page.getByTestId('pre-trip-gate-card')).toContainText('Defect detected');
    await expect(page.getByTestId('start-reinspection-btn')).toBeVisible();

    // 8. Perform a passing pre-trip re-inspection
    await page.getByTestId('start-reinspection-btn').click();
    await expect(page).toHaveURL(/\/inspections\/new/u);
    await page.getByTestId('submit-inspection-button').click();
    await expect(page).toHaveURL(/\/inspections\/[0-9a-f-]+/u);

    await page.getByTestId('start-inspection-button').click();
    // Complete with default PASS
    await page.getByTestId('complete-inspection-button').click();
    await expect(page.getByTestId('inspection-result-badge')).toHaveText('PASS');

    // 9. Return to trip: Pre-Trip Gate is now authorized
    await page.goto(`/trips/${tripId}`);
    await expect(page.getByTestId('pre-trip-gate-card')).toContainText('Pre-Trip Inspection: PASS');
    await expect(page.getByTestId('pre-trip-gate-card')).toContainText('Safety verified');

    // 10. Start Trip: transitions to IN_PROGRESS
    await page.getByTestId('start-trip-btn').click();
    await page.getByTestId('confirm-start-btn').click();
    await expect(page.getByTestId('trip-status')).toHaveText('IN_PROGRESS');

    // 11. Post-Trip Inspection Gate requires post-trip inspection before trip completion
    await expect(page.getByTestId('post-trip-gate-card')).toContainText(
      'Post-Trip Inspection Required',
    );

    await page.getByTestId('start-post-trip-inspection-btn').click();
    await expect(page).toHaveURL(/\/inspections\/new/u);
    await page.getByTestId('submit-inspection-button').click();
    await expect(page).toHaveURL(/\/inspections\/[0-9a-f-]+/u);

    await page.getByTestId('start-inspection-button').click();
    await page.getByTestId('complete-inspection-button').click();
    await expect(page.getByTestId('inspection-status-badge')).toHaveText('COMPLETED');

    // 12. Return to trip and complete trip
    await page.goto(`/trips/${tripId}`);
    await expect(page.getByTestId('post-trip-gate-card')).toContainText(
      'Post-Trip Inspection Completed',
    );

    await page.getByTestId('complete-trip-btn').click();
    await page.getByTestId('end-odometer-input').fill('15250');
    await page.getByTestId('confirm-complete-btn').click();
    await expect(page.getByTestId('trip-status')).toHaveText('COMPLETED');

    // 13. Verify trip inspections list table on trip detail
    await expect(page.getByTestId('trip-inspections-table')).toBeVisible();

    // 14. Verify vehicle inspection history
    await page.goto(`/vehicles/${vehicleId}`);
    await expect(page.getByTestId('vehicle-inspections-table')).toBeVisible();

    // 15. Verify driver inspection history
    await page.goto(`/drivers/${driverId}`);
    await expect(page.getByTestId('driver-inspections-table')).toBeVisible();
  });

  test('exercises inspection cancellation with mandatory cancel reason', async ({ page }) => {
    const timestamp = Date.now().toString().slice(-6);

    // 1. Create a vehicle
    await page.goto('/vehicles/new');
    await page.getByTestId('input-display-id').fill(`V-CANC-${timestamp}`);
    await page.getByTestId('input-registration').fill(`CN-${timestamp.slice(-4)}`);
    const safeTag = timestamp
      .toUpperCase()
      .replace(/[^A-HJ-NPR-Z0-9]/g, 'X')
      .slice(-6)
      .padStart(6, '0');
    await page.getByTestId('input-vin').fill(`1HGCR2F83HA${safeTag}`);
    await page.getByTestId('input-model').fill('Cancel Inspection Van');
    await page.getByTestId('select-type').selectOption('VAN');
    await page.getByTestId('select-fuel-type').selectOption('DIESEL');
    await page.getByTestId('input-year').fill('2024');
    await page.getByTestId('input-odometer').fill('12000');
    await page.getByTestId('submit-vehicle').click();
    await expect(page).toHaveURL(/\/vehicles\/[0-9a-f-]+/u);
    const vehicleId = page.url().split('/').pop()!;
    await page.getByTestId('activate-vehicle-btn').click();
    await expect(page.getByTestId('detail-status')).toHaveText('ACTIVE');

    // 2. Create driver and assignment, plan trip
    await page.goto('/drivers/new');
    await page.getByTestId('first-name-input').fill('Taylor');
    await page.getByTestId('last-name-input').fill(`CancelDriver-${timestamp}`);
    await page.getByTestId('employee-number-input').fill(`EMP-C-${timestamp}`);
    await page.getByTestId('submit-driver-button').click();
    await expect(page).toHaveURL(/\/drivers\/[0-9a-f-]+/u);
    const driverId = page.url().split('/').pop()!;

    await page.getByTestId('add-license-button').click();
    await page.getByTestId('license-number-input').fill(`DL-C-${timestamp}`);
    await page.getByTestId('license-country-input').fill('US');
    await page.getByTestId('license-region-input').fill('CA');
    await page.getByTestId('license-classes-input').fill('C');
    await page.getByTestId('license-issue-date-input').fill('2024-01-01');
    await page.getByTestId('license-expiry-date-input').fill('2030-01-01');
    await page.getByTestId('save-license-button').click();
    await page.getByTestId('activate-driver-button').click();

    await page.goto('/assignments/new');
    await page.getByTestId('vehicle-select').selectOption(vehicleId);
    await page.getByTestId('driver-select').selectOption(driverId);
    await page.getByTestId('submit-assignment-button').click();
    await expect(page).toHaveURL(/\/assignments\/[0-9a-f-]+/u);
    const assignmentId = page.url().split('/').pop()!;

    await page.goto('/trips/new');
    await page.getByTestId('assignment-select').selectOption(assignmentId);
    await page.getByTestId('origin-input').fill('Cancel Yard');
    await page.getByTestId('destination-input').fill('Standby Point');
    await page.getByTestId('submit-trip-btn').click();
    await expect(page).toHaveURL(/\/trips\/[0-9a-f-]+/u);
    const tripId = page.url().split('/').pop()!;
    await page.getByTestId('mark-ready-btn').click();
    await expect(page.getByTestId('trip-status')).toHaveText('READY');

    // 3. Create pre-trip inspection for the trip
    await page.goto(`/inspections/new?tripId=${tripId}&vehicleId=${vehicleId}&type=PRE_TRIP`);
    await page.getByTestId('submit-inspection-button').click();
    await expect(page).toHaveURL(/\/inspections\/[0-9a-f-]+/u);

    // 4. Cancel the inspection
    await page.getByTestId('cancel-inspection-button').click();
    await expect(page.getByTestId('cancel-modal')).toBeVisible();

    await page
      .getByTestId('cancel-reason-input')
      .fill('Vehicle was dispatched on urgent priority task before inspection');
    await page.getByTestId('confirm-cancel-button').click();

    // 5. Verify CANCELLED state and cancel reason
    await expect(page.getByTestId('inspection-status-badge')).toHaveText('CANCELLED');
    await expect(page.getByTestId('cancelled-banner')).toContainText(
      'Vehicle was dispatched on urgent priority task before inspection',
    );
    await expect(page.getByTestId('cancel-inspection-button')).not.toBeVisible();
    await expect(page.getByTestId('start-inspection-button')).not.toBeVisible();
  });

  test('enforces RBAC permissions: Dev Viewer role has read-only access to templates and inspections', async ({
    page,
  }) => {
    // 1. Switch to Dev Viewer
    await page.goto('/inspections');
    await page.getByTestId('auth-viewer-btn').click();
    await expect(page.getByTestId('user-badge')).toContainText('Viewer');

    // 2. Verify "Start Inspection" button is hidden for Viewer
    await expect(page.getByTestId('new-inspection-button')).not.toBeVisible();

    // 3. Verify "New Template" button is hidden on templates page
    await page.goto('/inspection-templates');
    await expect(page.getByTestId('new-template-button')).not.toBeVisible();

    // 4. Switch back to Dev Admin
    await page.getByTestId('auth-admin-btn').click();
    await expect(page.getByTestId('user-badge')).toContainText('Admin');
    await expect(page.getByTestId('new-template-button')).toBeVisible();
  });
});
