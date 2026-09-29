import { expect, test } from '@playwright/test';

test.describe('Vehicle Management Lifecycle and Authorization Acceptance Flow', () => {
  test('exercises complete vehicle lifecycle from creation to terminal retirement', async ({
    page,
  }) => {
    const timestamp = Date.now().toString().slice(-6);
    const displayId = `V-E2E-${timestamp}`;
    const registration = `PW-${timestamp.slice(0, 4)}AB`;
    const vin = `1HGCR2F83HA${timestamp.padStart(6, '0')}`;

    // 1. Authenticate dev admin and choose tenant context (set by default or switchable)
    await page.goto('/vehicles');
    await expect(page).toHaveTitle(/Vehicle Management System/u);
    await expect(page.getByRole('heading', { name: 'Vehicles', exact: true })).toBeVisible();

    // 2. Open Vehicle create page
    const createLink = page.getByTestId('create-vehicle-link');
    await expect(createLink).toBeVisible();
    await createLink.click();
    await expect(page).toHaveURL(/\/vehicles\/new/u);
    await expect(page.getByRole('heading', { name: 'New vehicle', exact: true })).toBeVisible();

    // 3. Fill in creation form aligned to backend contract
    await page.getByTestId('input-display-id').fill(displayId);
    await page.getByTestId('input-registration').fill(registration);
    await page.getByTestId('input-vin').fill(vin);
    await page.getByTestId('input-model').fill('Playwright Fleet Cruiser');
    await page.getByTestId('select-type').selectOption('CAR');
    await page.getByTestId('select-fuel-type').selectOption('PETROL');
    await page.getByTestId('input-year').fill('2024');
    await page.getByTestId('input-odometer').fill('12500');
    await page.getByTestId('input-notes').fill('E2E automated acceptance test intake');

    // 4. Submit form and verify navigation to detail page
    await page.getByTestId('submit-vehicle').click();
    await expect(page).toHaveURL(/\/vehicles\/[0-9a-f-]+/u);

    // 5. Verify vehicle detail in DRAFT status
    await expect(page.getByTestId('vehicle-display-id-heading')).toHaveText(displayId);
    await expect(page.getByTestId('detail-registration')).toHaveText(registration);
    await expect(page.getByTestId('detail-vin')).toHaveText(vin);
    await expect(page.getByTestId('detail-status')).toHaveText('DRAFT');
    await expect(page.getByTestId('detail-version')).toHaveText('1');
    await expect(page.getByTestId('status-history-list')).toContainText('DRAFT');
    await expect(page.getByTestId('status-history-list')).toContainText(
      'Vehicle created in DRAFT status',
    );

    // 6. Activate vehicle (DRAFT -> ACTIVE)
    const activateBtn = page.getByTestId('activate-vehicle-btn');
    await expect(activateBtn).toBeVisible();
    await activateBtn.click();

    // Verify ACTIVE status and transition history
    await expect(page.getByTestId('detail-status')).toHaveText('ACTIVE');
    await expect(page.getByTestId('status-history-list')).toContainText('DRAFT → ACTIVE');
    // Version incremented by activation
    await expect(page.getByTestId('detail-version')).toHaveText('2');
    // Activate button no longer visible in ACTIVE state
    await expect(page.getByTestId('activate-vehicle-btn')).toHaveCount(0);

    // 7. Edit vehicle metadata with optimistic concurrency
    const editBtn = page.getByTestId('edit-vehicle-btn');
    await expect(editBtn).toBeVisible();
    await editBtn.click();
    await expect(page.getByTestId('edit-vehicle-form')).toBeVisible();

    await page.getByTestId('edit-model-input').fill('Playwright Fleet Cruiser Updated');
    await page.getByTestId('edit-odometer-input').fill('14000');
    await page.getByTestId('edit-notes-input').fill('Updated via Playwright E2E');
    await page.getByTestId('save-edit-btn').click();

    // Verify updated metadata
    await expect(page.getByTestId('detail-model')).toHaveText('Playwright Fleet Cruiser Updated');
    await expect(page.getByTestId('detail-odometer')).toHaveText('14,000 km');
    await expect(page.getByTestId('detail-notes')).toHaveText('Updated via Playwright E2E');
    await expect(page.getByTestId('detail-version')).toHaveText('3');

    // 8. Return to vehicle list and verify search/filter
    await page.getByRole('link', { name: 'Back to list' }).click();
    await expect(page).toHaveURL('/vehicles');

    // Search for created vehicle
    await page.getByTestId('search-input').fill(displayId);
    await expect(page.getByTestId('vehicles-table')).toContainText(displayId);
    await expect(page.getByTestId('vehicles-table')).toContainText(registration);
    await expect(page.getByTestId('vehicles-table')).toContainText('ACTIVE');

    // Filter by status
    await page.getByTestId('status-filter').selectOption('ACTIVE');
    await expect(page.getByTestId('vehicles-table')).toContainText(displayId);

    // 9. Navigate back into vehicle detail and perform retirement
    await page.locator(`tr:has-text("${displayId}") a`).click();
    await expect(page).toHaveURL(/\/vehicles\/[0-9a-f-]+/u);

    const retireBtn = page.getByTestId('retire-vehicle-btn');
    await expect(retireBtn).toBeVisible();
    await retireBtn.click();

    // Verify confirmation modal
    await expect(page.getByTestId('retire-modal')).toBeVisible();
    await page
      .getByTestId('retire-reason-input')
      .fill('Decommissioned at completion of E2E acceptance test');
    await page.getByTestId('confirm-retire-btn').click();

    // 10. Verify RETIRED terminal state
    await expect(page.getByTestId('detail-status')).toHaveText('RETIRED');
    await expect(page.getByTestId('terminal-notice')).toBeVisible();
    await expect(page.getByTestId('terminal-notice')).toContainText(
      'Retirement is a terminal lifecycle state',
    );
    await expect(page.getByTestId('status-history-list')).toContainText('ACTIVE → RETIRED');
    await expect(page.getByTestId('status-history-list')).toContainText(
      'Decommissioned at completion of E2E acceptance test',
    );

    // Verify that terminal state cannot be activated or retired again
    await expect(page.getByTestId('activate-vehicle-btn')).toHaveCount(0);
    await expect(page.getByTestId('retire-vehicle-btn')).toHaveCount(0);
    await expect(page.getByTestId('edit-vehicle-btn')).toHaveCount(0);
  });

  test('enforces RBAC permissions: viewer role cannot create or mutate vehicles', async ({
    page,
  }) => {
    await page.goto('/vehicles');
    await expect(page.getByRole('heading', { name: 'Vehicles', exact: true })).toBeVisible();

    // Switch to Dev Viewer
    const switchViewerBtn = page.getByTestId('auth-viewer-btn');
    await expect(switchViewerBtn).toBeVisible();
    await switchViewerBtn.click();

    // Verify viewer status in tenant header
    await expect(page.getByTestId('user-badge')).toContainText('Development Viewer');

    // Verify Create vehicle link is hidden for viewer
    await expect(page.getByTestId('create-vehicle-link')).toHaveCount(0);

    // Open any existing vehicle in the table
    const firstRowLink = page.locator('[data-testid="vehicles-table"] tbody tr a').first();
    const count = await firstRowLink.count();
    if (count > 0) {
      await firstRowLink.click();
      await expect(page).toHaveURL(/\/vehicles\/[0-9a-f-]+/u);

      // Verify mutation buttons are hidden for viewer
      await expect(page.getByTestId('edit-vehicle-btn')).toHaveCount(0);
      await expect(page.getByTestId('activate-vehicle-btn')).toHaveCount(0);
      await expect(page.getByTestId('retire-vehicle-btn')).toHaveCount(0);

      // History should still be visible (viewer has vehicle.history.read)
      await expect(page.getByTestId('status-history-list')).toBeVisible();
    }
  });
});
