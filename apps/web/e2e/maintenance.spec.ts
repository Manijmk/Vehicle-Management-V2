import { expect, test } from '@playwright/test';

test.describe('Milestone 7: Maintenance Vertical Slice Acceptance Flow', () => {
  test('exercises complete Maintenance Request -> Work Order -> Task/Part/Labor Execution -> Completion lifecycle and unblocks Vehicle', async ({
    page,
  }) => {
    const timestamp = Date.now().toString().slice(-6);
    const vehicleDisplayId = `V-MNT-${timestamp}`;
    const vehicleReg = `MN-${timestamp.slice(-4)}TX`;
    const safeTag = timestamp
      .toUpperCase()
      .replace(/[^A-HJ-NPR-Z0-9]/g, 'X')
      .slice(-6)
      .padStart(6, '0');
    const vehicleVin = `1HGCR2F83MA${safeTag}`;

    // 1. Create and activate a vehicle
    await page.goto('/vehicles/new');
    await expect(page).toHaveTitle(/Vehicle Management System/u);
    await page.getByTestId('input-display-id').fill(vehicleDisplayId);
    await page.getByTestId('input-registration').fill(vehicleReg);
    await page.getByTestId('input-vin').fill(vehicleVin);
    await page.getByTestId('input-model').fill('Playwright Heavy Duty');
    await page.getByTestId('select-type').selectOption('TRUCK');
    await page.getByTestId('select-fuel-type').selectOption('DIESEL');
    await page.getByTestId('input-year').fill('2024');
    await page.getByTestId('input-odometer').fill('15000');
    await page.getByTestId('submit-vehicle').click();

    await expect(page).toHaveURL(/\/vehicles\/[0-9a-f-]+/u);
    const vehicleId = page.url().split('/').pop()!;
    await page.getByTestId('activate-vehicle-btn').click();
    await expect(page.getByTestId('detail-status')).toHaveText('ACTIVE');

    // Initially vehicle is operationally ready
    await expect(page.getByTestId('badge-operational-status')).toHaveText('OPERATIONALLY READY');

    // 2. Submit a CRITICAL blocking Maintenance Request
    await page.goto('/maintenance/requests/new');
    await page.getByTestId('input-vehicle').selectOption(vehicleId);
    await page.getByTestId('input-title').fill(`Brake Caliper Seized on ${vehicleDisplayId}`);
    await page
      .getByTestId('input-description')
      .fill('Severe right-pull under braking, heavy smoke and smell of burning friction material.');
    await page.getByTestId('input-priority').selectOption('CRITICAL');

    // Ensure blocking checkbox is checked
    const blocksCheckbox = page.getByTestId('input-blocks-operation');
    if (!(await blocksCheckbox.isChecked())) {
      await blocksCheckbox.check();
    }
    await page.getByTestId('btn-submit-request').click();

    await expect(page).toHaveURL(/\/maintenance\/requests\/[0-9a-f-]+/u);
    const requestId = page.url().split('/').pop()!;
    await expect(page.getByTestId('badge-request-status')).toHaveText('OPEN');
    await expect(page.getByTestId('text-priority')).toHaveText('CRITICAL');

    // 3. Verify vehicle is now Operationally Blocked
    await page.goto(`/vehicles/${vehicleId}`);
    await expect(page.getByTestId('badge-operational-status')).toHaveText('BLOCKED (MAINTENANCE)');
    await expect(page.getByTestId('vehicle-maintenance-blocked-banner')).toBeVisible();

    // 4. Convert Request into a Work Order
    await page.goto(`/maintenance/requests/${requestId}`);
    await page.getByTestId('btn-open-convert-modal').click();
    await expect(page.getByTestId('modal-convert')).toBeVisible();
    await page.getByTestId('btn-confirm-convert').click();

    await expect(page).toHaveURL(/\/maintenance\/work-orders\/[0-9a-f-]+/u);
    await expect(page.getByTestId('badge-work-order-status')).toHaveText('OPEN');

    // 5. Add Task
    await page.getByTestId('input-task-description').fill('Replace right front caliper and rotor');
    await page.getByTestId('btn-add-task').click();
    await expect(page.locator('[data-testid^="task-item-"]')).toBeVisible();

    // 7. Add Part
    await page.getByTestId('input-part-number').fill('BRK-4402');
    await page.getByTestId('input-part-desc').fill('Heavy Duty Brake Caliper Kit');
    await page.getByTestId('input-part-qty').fill('2');
    await page.getByTestId('input-part-cost').fill('85.00');
    await page.getByTestId('btn-add-part').click();
    await expect(page.getByTestId('table-parts')).toContainText('BRK-4402');
    await expect(page.getByTestId('table-parts')).toContainText('$170.00');

    // 8. Add Labor
    await page.getByTestId('input-labor-desc').fill('Hydraulic caliper rebuild & system bleed');
    await page.getByTestId('input-labor-tech').fill('Master Tech Jordan');
    await page.getByTestId('input-labor-hours').fill('2.5');
    await page.getByTestId('input-labor-rate').fill('60.00');
    await page.getByTestId('btn-add-labor').click();
    await expect(page.getByTestId('table-labor')).toContainText(
      'Hydraulic caliper rebuild & system bleed',
    );
    await expect(page.getByTestId('table-labor')).toContainText('$150.00');

    // Verify subtotal card
    await expect(page.getByTestId('text-total-cost')).toHaveText('$320.00');

    // 9. Start Work Order
    await page.getByTestId('btn-start-work-order').click();
    await expect(page.getByTestId('badge-work-order-status')).toHaveText('IN_PROGRESS');

    // 10. Complete Task
    const taskCheckbox = page.locator('[data-testid^="checkbox-task-"]').first();
    await taskCheckbox.click();
    await expect(taskCheckbox).toBeChecked();

    // 11. Complete Work Order
    await page.getByTestId('btn-complete-work-order').click();
    await page
      .getByTestId('input-completion-notes')
      .fill('Replaced caliper kit, bled brake lines, test driven.');
    await page.getByTestId('input-completion-odometer').fill('15050');
    await page.getByTestId('btn-confirm-complete').click();

    await expect(page.getByTestId('badge-work-order-status')).toHaveText('COMPLETED');

    // 12. Verify Vehicle is now unblocked and odometer updated
    await page.goto(`/vehicles/${vehicleId}`);
    await expect(page.getByTestId('badge-operational-status')).toHaveText('OPERATIONALLY READY');
    await expect(page.getByTestId('vehicle-maintenance-blocked-banner')).not.toBeVisible();
    await expect(page.getByTestId('detail-odometer')).toHaveText('15,050 km');

    // 13. Verify Request is in terminal CONVERTED state and links to work order
    await page.goto(`/maintenance/requests/${requestId}`);
    await expect(page.getByTestId('badge-request-status')).toHaveText('CONVERTED');
    await expect(page.getByTestId('link-converted-work-order')).toBeVisible();
  });

  test('exercises Trip Maintenance Gate: blocking maintenance rejects dispatch, unblocks when maintenance request is cancelled', async ({
    page,
  }) => {
    const timestamp = Date.now().toString().slice(-6);
    const vehicleDisplayId = `V-GATE-${timestamp}`;
    const vehicleReg = `GT-${timestamp.slice(-4)}TX`;
    const safeTag = timestamp
      .toUpperCase()
      .replace(/[^A-HJ-NPR-Z0-9]/g, 'X')
      .slice(-6)
      .padStart(6, '0');
    const vehicleVin = `1HGCR2F83GA${safeTag}`;

    // 1. Create and activate vehicle
    await page.goto('/vehicles/new');
    await page.getByTestId('input-display-id').fill(vehicleDisplayId);
    await page.getByTestId('input-registration').fill(vehicleReg);
    await page.getByTestId('input-vin').fill(vehicleVin);
    await page.getByTestId('input-model').fill('Playwright Gate Van');
    await page.getByTestId('select-type').selectOption('VAN');
    await page.getByTestId('select-fuel-type').selectOption('DIESEL');
    await page.getByTestId('input-year').fill('2024');
    await page.getByTestId('input-odometer').fill('20000');
    await page.getByTestId('submit-vehicle').click();
    await expect(page).toHaveURL(/\/vehicles\/[0-9a-f-]+/u);
    const vehicleId = page.url().split('/').pop()!;
    await page.getByTestId('activate-vehicle-btn').click();
    await expect(page.getByTestId('detail-status')).toHaveText('ACTIVE');

    // 2. Create and activate driver
    await page.goto('/drivers/new');
    await page.getByTestId('first-name-input').fill('Sam');
    await page.getByTestId('last-name-input').fill(`GateDriver-${timestamp}`);
    await page.getByTestId('employee-number-input').fill(`EMP-G-${timestamp}`);
    await page.getByTestId('submit-driver-button').click();
    await expect(page).toHaveURL(/\/drivers\/[0-9a-f-]+/u);
    const driverId = page.url().split('/').pop()!;

    await page.getByTestId('add-license-button').click();
    await page.getByTestId('license-number-input').fill(`DL-G-${timestamp}`);
    await page.getByTestId('license-country-input').fill('US');
    await page.getByTestId('license-region-input').fill('TX');
    await page.getByTestId('license-classes-input').fill('C');
    await page.getByTestId('license-issue-date-input').fill('2024-01-01');
    await page.getByTestId('license-expiry-date-input').fill('2030-01-01');
    await page.getByTestId('save-license-button').click();
    await expect(page.getByTestId('licenses-table')).toContainText(`DL-G-${timestamp}`);
    await page.getByTestId('activate-driver-button').click();
    await expect(page.getByTestId('driver-status-badge-active')).toBeVisible();
    await expect(page.getByTestId('driver-eligibility-badge')).toContainText('Eligible');

    // 3. Assign driver to vehicle
    await page.goto('/assignments/new');
    await page.getByTestId('vehicle-select').selectOption(vehicleId);
    await page.getByTestId('driver-select').selectOption(driverId);
    await page.getByTestId('submit-assignment-button').click();
    await expect(page).toHaveURL(/\/assignments\/[0-9a-f-]+/u);
    const assignmentId = page.url().split('/').pop()!;

    // 4. Plan a Trip
    await page.goto('/trips/new');
    await page.getByTestId('assignment-select').selectOption(assignmentId);
    await page.getByTestId('origin-input').fill('Austin Hub');
    await page.getByTestId('destination-input').fill('Dallas Depot');
    await page.getByTestId('submit-trip-btn').click();
    await expect(page).toHaveURL(/\/trips\/[0-9a-f-]+/u);
    const tripId = page.url().split('/').pop()!;
    await expect(page.getByTestId('trip-status')).toHaveText('DRAFT');

    // 5. Create a CRITICAL blocking maintenance request
    await page.goto('/maintenance/requests/new');
    await page.getByTestId('input-vehicle').selectOption(vehicleId);
    await page.getByTestId('input-title').fill(`Steering Rack Loose ${timestamp}`);
    await page.getByTestId('input-description').fill('Excessive steering play detected.');
    await page.getByTestId('input-priority').selectOption('CRITICAL');
    const chk = page.getByTestId('input-blocks-operation');
    if (!(await chk.isChecked())) {
      await chk.check();
    }
    await page.getByTestId('btn-submit-request').click();
    await expect(page).toHaveURL(/\/maintenance\/requests\/[0-9a-f-]+/u);
    const requestId = page.url().split('/').pop()!;

    // 6. Return to trip: warning banner is shown, marking ready fails with maintenance gate error
    await page.goto(`/trips/${tripId}`);
    await expect(page.getByTestId('trip-maintenance-warning-banner')).toBeVisible();
    await page.getByTestId('mark-ready-btn').click();
    await expect(page.getByTestId('action-error-banner')).toContainText(
      'blocked by active maintenance',
    );
    await expect(page.getByTestId('trip-status')).toHaveText('DRAFT');

    // 7. Cancel the maintenance request (e.g. false alarm)
    await page.goto(`/maintenance/requests/${requestId}`);
    await page.getByTestId('btn-open-cancel-modal').click();
    await page
      .getByTestId('input-cancel-reason')
      .fill('False alarm, steering checked and verified within tolerance.');
    await page.getByTestId('btn-confirm-cancel').click();
    await expect(page.getByTestId('badge-request-status')).toHaveText('CANCELLED');

    // 8. Return to trip: vehicle is no longer blocked, mark ready succeeds
    await page.goto(`/trips/${tripId}`);
    await expect(page.getByTestId('trip-maintenance-warning-banner')).not.toBeVisible();
    await page.getByTestId('mark-ready-btn').click();
    await expect(page.getByTestId('trip-status')).toHaveText('READY');
  });

  test('Release Gate 1: exercises complete Critical Inspection -> Outbox Worker Escalation -> Idempotency -> Operational Block -> Resolution lifecycle', async ({
    page,
  }) => {
    test.setTimeout(60000);
    const timestamp = Date.now().toString().slice(-6);
    const vehicleDisplayId = `V-CRIT-${timestamp}`;
    const vehicleReg = `CR-${timestamp.slice(-4)}TX`;
    const safeTag = timestamp
      .toUpperCase()
      .replace(/[^A-HJ-NPR-Z0-9]/g, 'X')
      .slice(-6)
      .padStart(6, '0');
    const vehicleVin = `1HGCR2F83CA${safeTag}`;
    const templateName = `Critical Brake Safety Template ${timestamp}`;

    // 1. Create and activate a vehicle
    await page.goto('/vehicles/new');
    await expect(page).toHaveTitle(/Vehicle Management System/u);
    await page.getByTestId('input-display-id').fill(vehicleDisplayId);
    await page.getByTestId('input-registration').fill(vehicleReg);
    await page.getByTestId('input-vin').fill(vehicleVin);
    await page.getByTestId('input-model').fill('Heavy Rescue Truck');
    await page.getByTestId('select-type').selectOption('TRUCK');
    await page.getByTestId('select-fuel-type').selectOption('DIESEL');
    await page.getByTestId('input-year').fill('2024');
    await page.getByTestId('input-odometer').fill('10000');
    await page.getByTestId('submit-vehicle').click();

    await expect(page).toHaveURL(/\/vehicles\/[0-9a-f-]+/u);
    const vehicleId = page.url().split('/').pop()!;
    await page.getByTestId('activate-vehicle-btn').click();
    await expect(page.getByTestId('detail-status')).toHaveText('ACTIVE');
    await expect(page.getByTestId('badge-operational-status')).toHaveText('OPERATIONALLY READY');

    // 2. Create an Inspection Template containing at least one critical item
    await page.goto('/inspection-templates/new');
    await page.getByTestId('template-name-input').fill(templateName);
    await page
      .getByTestId('template-description-input')
      .fill('Critical braking and hydraulic safety audit');
    await page.getByTestId('template-type-select').selectOption('SAFETY');

    // Fill first item as CRITICAL
    await page.getByTestId('item-category-0').fill('Braking System');
    await page.getByTestId('item-prompt-0').fill('Inspect hydraulic pressure and lines');
    await page.getByTestId('item-severity-0').selectOption('CRITICAL');

    // Add second item as NORMAL
    await page.getByTestId('add-item-button').click();
    await page.getByTestId('item-category-1').fill('Tires');
    await page.getByTestId('item-prompt-1').fill('Check tire tread depth');
    await page.getByTestId('item-severity-1').selectOption('NORMAL');

    await page.getByTestId('submit-template-button').click();
    await expect(page).toHaveURL(/\/inspection-templates\/[0-9a-f-]+/u);
    const templateId = page.url().split('/').pop()!;
    await page.getByTestId('activate-template-btn').click();
    await expect(page.getByTestId('template-status-badge')).toHaveText('ACTIVE');

    // 3. Create Inspection for the vehicle using this template
    await page.goto('/inspections/new');
    await expect(page.getByTestId('inspection-vehicle-select')).toBeVisible();
    await page.getByTestId('inspection-vehicle-select').selectOption(vehicleId);
    await page.getByTestId('inspection-type-select').selectOption('SAFETY');
    await page.getByTestId('inspection-template-select').selectOption(templateId);
    await page.getByTestId('submit-inspection-button').click();

    await expect(page).toHaveURL(/\/inspections\/[0-9a-f-]+/u);
    const inspectionId = page.url().split('/').pop()!;
    await expect(page.getByTestId('inspection-status-badge')).toHaveText('DRAFT');

    // 4. Start inspection and record FAIL on the critical item
    await page.getByTestId('start-inspection-button').click();
    await expect(page.getByTestId('inspection-status-badge')).toHaveText('IN_PROGRESS');

    const firstFailRadio = page.locator('input[type="radio"][value="FAIL"]').first();
    await firstFailRadio.check();
    const firstCommentInput = page.locator('input[data-testid^="response-comment-"]').first();
    await firstCommentInput.fill('Severe hydraulic fluid leak detected under main pressure valve');

    // Complete inspection
    await page.getByTestId('complete-inspection-button').click();
    await expect(page.getByTestId('inspection-status-badge')).toHaveText('COMPLETED');
    await expect(page.getByTestId('inspection-result-badge')).toHaveText('FAIL');

    // 5. Worker Escalation: Poll until real outbox worker creates Maintenance Request
    await expect(async () => {
      await page.reload();
      await expect(page.getByTestId('linked-maintenance-request')).toBeVisible();
    }).toPass({ timeout: 15000, intervals: [1000, 2000] });

    await expect(page.getByTestId('linked-maintenance-request')).toContainText('CRITICAL');
    await expect(page.getByTestId('linked-maintenance-request')).toContainText('YES');

    // Click link to navigate to the Maintenance Request
    await page.getByTestId('view-maintenance-request-link').click();
    await expect(page).toHaveURL(/\/maintenance\/requests\/[0-9a-f-]+/u);
    const requestId = page.url().split('/').pop()!;

    await expect(page.getByTestId('badge-request-status')).toHaveText('OPEN');
    await expect(page.getByTestId('text-priority')).toHaveText('CRITICAL');
    await expect(page.getByTestId('notice-blocking')).toBeVisible();
    await expect(page.getByTestId('link-source-inspection')).toBeVisible();

    // 6. Verify Idempotency: verify only 1 request exists for this inspection
    const reqCount = await page.evaluate(async (inspId) => {
      const token = localStorage.getItem('vms_auth_token');
      const orgId = localStorage.getItem('vms_org_id') || '10000000-0000-4000-8000-000000000001';
      const res = await fetch('http://localhost:3001/api/v1/maintenance/requests?limit=100', {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-organization-id': orgId,
        },
      });
      const data = await res.json();
      return (data.items || []).filter(
        (r: { sourceInspectionId?: string }) => r.sourceInspectionId === inspId,
      ).length;
    }, inspectionId);
    expect(reqCount).toBe(1);

    // 7. Verify Vehicle is now Operationally Blocked while vehicle.status remains ACTIVE
    await page.goto(`/vehicles/${vehicleId}`);
    await expect(page.getByTestId('detail-status')).toHaveText('ACTIVE');
    await expect(page.getByTestId('badge-operational-status')).toHaveText('BLOCKED (MAINTENANCE)');
    await expect(page.getByTestId('vehicle-maintenance-blocked-banner')).toBeVisible();

    // 8. Create Driver, Assignment, and Trip to verify Trip Maintenance Gate
    await page.goto('/drivers/new');
    await page.getByTestId('first-name-input').fill('Jordan');
    await page.getByTestId('last-name-input').fill(`CritDriver-${timestamp}`);
    await page.getByTestId('employee-number-input').fill(`EMP-CR-${timestamp}`);
    await page.getByTestId('submit-driver-button').click();
    await expect(page).toHaveURL(/\/drivers\/[0-9a-f-]+/u);
    const driverId = page.url().split('/').pop()!;

    await page.getByTestId('add-license-button').click();
    await page.getByTestId('license-number-input').fill(`DL-CR-${timestamp}`);
    await page.getByTestId('license-country-input').fill('US');
    await page.getByTestId('license-region-input').fill('TX');
    await page.getByTestId('license-classes-input').fill('C');
    await page.getByTestId('license-issue-date-input').fill('2024-01-01');
    await page.getByTestId('license-expiry-date-input').fill('2030-01-01');
    await page.getByTestId('save-license-button').click();
    await page.getByTestId('activate-driver-button').click();
    await expect(page.getByTestId('driver-status-badge-active')).toBeVisible();

    // Assign driver to vehicle
    await page.goto('/assignments/new');
    await page.getByTestId('vehicle-select').selectOption(vehicleId);
    await page.getByTestId('driver-select').selectOption(driverId);
    await page.getByTestId('submit-assignment-button').click();
    await expect(page).toHaveURL(/\/assignments\/[0-9a-f-]+/u);
    const assignmentId = page.url().split('/').pop()!;

    // Plan Trip
    await page.goto('/trips/new');
    await page.getByTestId('assignment-select').selectOption(assignmentId);
    await page.getByTestId('origin-input').fill('North Station');
    await page.getByTestId('destination-input').fill('South Terminal');
    await page.getByTestId('submit-trip-btn').click();
    await expect(page).toHaveURL(/\/trips\/[0-9a-f-]+/u);
    const tripId = page.url().split('/').pop()!;

    // Trip Maintenance Gate rejects READY
    await page.getByTestId('mark-ready-btn').click();
    await expect(page.getByTestId('action-error-banner')).toContainText(
      'blocked by active maintenance',
    );
    await expect(page.getByTestId('trip-status')).toHaveText('DRAFT');

    // 9. Convert automatic Request to Work Order & Resolve
    await page.goto(`/maintenance/requests/${requestId}`);
    await page.getByTestId('btn-open-convert-modal').click();
    await page.getByTestId('btn-confirm-convert').click();
    await expect(page).toHaveURL(/\/maintenance\/work-orders\/[0-9a-f-]+/u);
    await expect(page.getByTestId('badge-work-order-status')).toHaveText('OPEN');

    // Add task and start work order
    await page
      .getByTestId('input-task-description')
      .fill('Replace hydraulic lines and pressure valve');
    await page.getByTestId('btn-add-task').click();
    await expect(page.locator('[data-testid^="task-item-"]')).toBeVisible();

    await page.getByTestId('btn-start-work-order').click();
    await expect(page.getByTestId('badge-work-order-status')).toHaveText('IN_PROGRESS');

    // Complete task and complete work order
    const taskCheckbox = page.locator('[data-testid^="checkbox-task-"]').first();
    await taskCheckbox.click();
    await expect(taskCheckbox).toBeChecked();

    await page.getByTestId('btn-complete-work-order').click();
    await page
      .getByTestId('input-completion-notes')
      .fill('Replaced hydraulic lines and pressure tested system.');
    await page.getByTestId('input-completion-odometer').fill('10050');
    await page.getByTestId('btn-confirm-complete').click();
    await expect(page.getByTestId('badge-work-order-status')).toHaveText('COMPLETED');

    // 10. Verify Vehicle is now unblocked and Trip can proceed
    await page.goto(`/vehicles/${vehicleId}`);
    await expect(page.getByTestId('detail-status')).toHaveText('ACTIVE');
    await expect(page.getByTestId('badge-operational-status')).toHaveText('OPERATIONALLY READY');
    await expect(page.getByTestId('vehicle-maintenance-blocked-banner')).not.toBeVisible();

    await page.goto(`/trips/${tripId}`);
    await expect(page.getByTestId('trip-maintenance-warning-banner')).not.toBeVisible();
    await page.getByTestId('mark-ready-btn').click();
    await expect(page.getByTestId('trip-status')).toHaveText('READY');

    // Verify source Request is terminal CONVERTED
    await page.goto(`/maintenance/requests/${requestId}`);
    await expect(page.getByTestId('badge-request-status')).toHaveText('CONVERTED');
    await expect(page.getByTestId('link-converted-work-order')).toBeVisible();
  });

  test('Release Gate 2: exercises complete Preventive Plan -> Schedule -> Work Order Completion Reset -> Cancellation Regression lifecycle', async ({
    page,
  }) => {
    test.setTimeout(60000);
    const timestamp = Date.now().toString().slice(-6);
    const vehicleDisplayId = `V-SCHED-${timestamp}`;
    const vehicleReg = `SC-${timestamp.slice(-4)}TX`;
    const safeTag = timestamp
      .toUpperCase()
      .replace(/[^A-HJ-NPR-Z0-9]/g, 'X')
      .slice(-6)
      .padStart(6, '0');
    const vehicleVin = `1HGCR2F83SA${safeTag}`;
    const planName = `Fleet Service Plan 30d 5000km ${timestamp}`;

    // 1. Create and activate a vehicle at 20,000 km
    await page.goto('/vehicles/new');
    await page.getByTestId('input-display-id').fill(vehicleDisplayId);
    await page.getByTestId('input-registration').fill(vehicleReg);
    await page.getByTestId('input-vin').fill(vehicleVin);
    await page.getByTestId('input-model').fill('Fleet Express Van');
    await page.getByTestId('select-type').selectOption('VAN');
    await page.getByTestId('select-fuel-type').selectOption('PETROL');
    await page.getByTestId('input-year').fill('2024');
    await page.getByTestId('input-odometer').fill('20000');
    await page.getByTestId('submit-vehicle').click();

    await expect(page).toHaveURL(/\/vehicles\/[0-9a-f-]+/u);
    const vehicleId = page.url().split('/').pop()!;
    await page.getByTestId('activate-vehicle-btn').click();
    await expect(page.getByTestId('detail-status')).toHaveText('ACTIVE');

    // 2. Create DRAFT Maintenance Plan with intervalDays=30 and intervalOdometerKm=5000
    await page.goto('/maintenance/plans/new');
    await page.getByTestId('input-plan-name').fill(planName);
    await page
      .getByTestId('input-plan-description')
      .fill('Full oil, filter, and safety inspection');
    await page.getByTestId('input-interval-days').fill('30');
    await page.getByTestId('input-interval-km').fill('5000');
    await page.getByTestId('select-default-priority').selectOption('HIGH');
    await page.getByTestId('btn-submit-plan').click();

    await expect(page).toHaveURL(/\/maintenance\/plans\/[0-9a-f-]+/u);
    await expect(page.getByTestId('badge-plan-status')).toHaveText('DRAFT');

    // 3. Activate Plan
    await page.getByTestId('btn-activate-plan').click();
    await expect(page.getByTestId('badge-plan-status')).toHaveText('ACTIVE');

    // 4. Assign Plan to Vehicle
    await page.getByTestId('btn-open-assign-modal').click();
    await page.getByTestId('select-assign-vehicle').selectOption(vehicleId);
    await page.getByTestId('btn-submit-assign-vehicle').click();
    await expect(page.getByTestId('table-plan-schedules')).toContainText(vehicleDisplayId);

    // 5. Navigate to /maintenance/schedules and verify initial schedule values
    await page.goto('/maintenance/schedules');
    const schedRow = page.locator('tr', { hasText: vehicleDisplayId });
    await expect(schedRow).toBeVisible();

    const schedBtn = schedRow.locator('button[data-testid^="btn-create-wo-from-sched-"]').first();
    const schedIdAttr = await schedBtn.getAttribute('data-testid');
    const scheduleId = schedIdAttr!.replace('btn-create-wo-from-sched-', '');

    // Initial values:
    // lastCompletedAt: Never
    // nextDueOdometerKm: 20,000 + 5,000 = 25,000 km
    // dueState: UPCOMING
    await expect(page.getByTestId(`cell-last-performed-${scheduleId}`)).toHaveText('Never');
    await expect(page.getByTestId(`cell-next-due-km-${scheduleId}`)).toHaveText('25,000 km');
    await expect(page.getByTestId(`badge-due-state-${scheduleId}`)).toHaveText('UPCOMING');

    // 6. Create Work Order FROM the Schedule
    await page.getByTestId(`btn-create-wo-from-sched-${scheduleId}`).click();
    await expect(page).toHaveURL(/\/maintenance\/work-orders\/[0-9a-f-]+/u);
    const workOrderId1 = page.url().split('/').pop()!;

    await expect(page.getByTestId('badge-work-order-status')).toHaveText('OPEN');

    // Verify Schedule duplicate guard: attempting to create a second active WO is prevented
    await page.goto('/maintenance/schedules');
    const woBtn = page.getByTestId(`btn-create-wo-from-sched-${scheduleId}`);
    await expect(woBtn).toBeDisabled();
    await expect(woBtn).toHaveText('Active WO in Progress');

    // 7. Complete the Schedule Work Order
    await page.goto(`/maintenance/work-orders/${workOrderId1}`);
    await page.getByTestId('input-task-description').fill('Execute 25k km scheduled maintenance');
    await page.getByTestId('btn-add-task').click();
    await expect(page.locator('[data-testid^="task-item-"]')).toBeVisible();

    await page.getByTestId('btn-start-work-order').click();
    await expect(page.getByTestId('badge-work-order-status')).toHaveText('IN_PROGRESS');

    const taskCheckbox = page.locator('[data-testid^="checkbox-task-"]').first();
    await taskCheckbox.click();
    await expect(taskCheckbox).toBeChecked();

    await page.getByTestId('btn-complete-work-order').click();
    await page.getByTestId('input-completion-notes').fill('Scheduled maintenance completed.');
    await page.getByTestId('input-completion-odometer').fill('20500');
    await page.getByTestId('btn-confirm-complete').click();
    await expect(page.getByTestId('badge-work-order-status')).toHaveText('COMPLETED');

    // 8. Verify Schedule Reset:
    // lastCompletedAt: today's date
    // nextDueOdometerKm: 20,500 + 5,000 = 25,500 km
    // dueState: UPCOMING (20,500 < 25,500)
    await page.goto('/maintenance/schedules');
    await expect(page.getByTestId(`cell-last-performed-${scheduleId}`)).not.toHaveText('Never');
    const performedDateText = await page
      .getByTestId(`cell-last-performed-${scheduleId}`)
      .innerText();
    expect(performedDateText).toContain('2026');
    await expect(page.getByTestId(`cell-next-due-km-${scheduleId}`)).toHaveText('25,500 km');
    await expect(page.getByTestId(`badge-due-state-${scheduleId}`)).toHaveText('UPCOMING');

    // 9. Cancellation Regression: Cancelling a schedule work order must NOT reset the schedule
    // Create second work order from the schedule
    await page.getByTestId(`btn-create-wo-from-sched-${scheduleId}`).click();
    await expect(page).toHaveURL(/\/maintenance\/work-orders\/[0-9a-f-]+/u);
    await expect(page.getByTestId('badge-work-order-status')).toHaveText('OPEN');

    // Cancel Work Order #2
    await page.getByTestId('btn-cancel-work-order').click();
    await page.getByTestId('input-cancel-reason').fill('Postponed due to fleet redeployment');
    await page.getByTestId('btn-confirm-cancel').click();
    await expect(page.getByTestId('badge-work-order-status')).toHaveText('CANCELLED');

    // Return to schedules and verify thresholds remain UNCHANGED from Work Order #1's completion
    await page.goto('/maintenance/schedules');
    await expect(page.getByTestId(`cell-last-performed-${scheduleId}`)).toHaveText(
      performedDateText,
    );
    await expect(page.getByTestId(`cell-next-due-km-${scheduleId}`)).toHaveText('25,500 km');
    await expect(page.getByTestId(`badge-due-state-${scheduleId}`)).toHaveText('UPCOMING');
  });

  test('exercises Maintenance Vendors registration and active/inactive toggle', async ({
    page,
  }) => {
    const timestamp = Date.now().toString().slice(-6);
    const vendorName = `Apex Fleet Service Depot ${timestamp}`;

    await page.goto('/maintenance/vendors');
    await page.getByTestId('btn-create-vendor').click();

    await page.getByTestId('input-vendor-name').fill(vendorName);
    await page.getByTestId('input-vendor-contact').fill('Alex Rivera');
    await page.getByTestId('input-vendor-phone').fill('+1 555-8822');
    await page.getByTestId('input-vendor-email').fill(`service-${timestamp}@apexfleet.com`);
    await page
      .getByTestId('input-vendor-notes')
      .fill('Certified for heavy commercial truck maintenance');
    await page.getByTestId('btn-submit-vendor').click();

    await expect(page.getByTestId('table-vendors')).toContainText(vendorName);

    // Toggle status to Inactive and back to Active
    const toggleButton = page.locator('button[data-testid^="btn-toggle-vendor-"]').first();
    await toggleButton.click();
    await expect(page.locator('span[data-testid^="badge-vendor-status-"]').first()).toHaveText(
      'INACTIVE',
    );

    await toggleButton.click();
    await expect(page.locator('span[data-testid^="badge-vendor-status-"]').first()).toHaveText(
      'ACTIVE',
    );
  });
});
