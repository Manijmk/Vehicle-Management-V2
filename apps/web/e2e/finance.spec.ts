import { expect, test } from '@playwright/test';

test.describe('Milestone 9: Finance (Fuel & Expenses) Vertical Slice Acceptance Flow', () => {
  test('exercises complete Finance vertical slice: manual fuel logging, anomaly detection, voiding, CSV import, expense draft lifecycle, category management, and vehicle efficiency metrics', async ({
    page,
  }) => {
    test.setTimeout(90000);

    const timestamp = Date.now().toString().slice(-6);
    const vehicleDisplayId = `V-FIN-${timestamp}`;
    const vehicleReg = `FN-${timestamp.slice(-4)}TX`;
    const safeTag = timestamp
      .toUpperCase()
      .replace(/[^A-HJ-NPR-Z0-9]/g, 'X')
      .slice(-6)
      .padStart(6, '0');
    const vehicleVin = `1HGCR2F83MA${safeTag}`;

    // 1. Create and activate an active vehicle for financial testing
    await page.goto('/vehicles/new');
    await expect(page).toHaveTitle(/Vehicle Management System/u);
    await page.getByTestId('input-display-id').fill(vehicleDisplayId);
    await page.getByTestId('input-registration').fill(vehicleReg);
    await page.getByTestId('input-vin').fill(vehicleVin);
    await page.getByTestId('input-model').fill('Ford Super Duty F-350');
    await page.getByTestId('select-type').selectOption('TRUCK');
    await page.getByTestId('select-fuel-type').selectOption('DIESEL');
    await page.getByTestId('input-year').fill('2025');
    await page.getByTestId('input-odometer').fill('20000');
    await page.getByTestId('submit-vehicle').click();

    await expect(page).toHaveURL(/\/vehicles\/[0-9a-f-]+/u);
    const vehicleId = page.url().split('/').pop()!;
    await page.getByTestId('activate-vehicle-btn').click();
    await expect(page.getByTestId('detail-status')).toHaveText('ACTIVE');

    // 2. Navigation bar verification
    await expect(page.getByTestId('nav-finance')).toBeVisible();
    await expect(page.getByTestId('nav-fuel')).toBeVisible();
    await expect(page.getByTestId('nav-expenses')).toBeVisible();

    // 3. Category Management: Create new category and verify
    await page.goto('/expense-categories');
    await expect(page.getByTestId('categories-title')).toBeVisible();
    const catCode = `TOLL_${timestamp}`;
    await page.getByTestId('input-category-code').fill(catCode);
    await page.getByTestId('input-category-name').fill(`Express Toll ${timestamp}`);
    await page.getByTestId('input-category-description').fill('Turnpike and express lane tolls');
    await page.getByTestId('btn-create-category').click();
    await expect(page.getByTestId(`category-row-${catCode}`)).toBeVisible();
    await expect(page.getByTestId(`cat-status-${catCode}`)).toHaveText('ACTIVE');

    // 4. Manual Fuel Purchase #1: baseline refuel at 20500 km
    await page.goto('/fuel/new');
    await expect(page.getByTestId('new-fuel-title')).toBeVisible();
    await page.getByTestId('input-vehicle').selectOption(vehicleId);
    await page.getByTestId('input-energy-type').selectOption('DIESEL');
    await page.getByTestId('input-quantity').fill('50');
    await page.getByTestId('input-unit').selectOption('LITER');
    await page.getByTestId('input-unit-price').fill('2.00');
    await page.getByTestId('input-currency').fill('USD');
    await page.getByTestId('input-odometer').fill('20500');
    await page.getByTestId('input-station').fill('Shell Travel Plaza');
    await page.getByTestId('input-reference').fill(`REC-BASE-${timestamp}`);

    // Verify computed total is automatically calculated
    await expect(page.getByTestId('computed-total')).toHaveText(/100\.00 USD/);

    await page.getByTestId('submit-fuel').click();
    await expect(page).toHaveURL(/\/fuel\/[0-9a-f-]+/u);

    await expect(page.getByTestId('fuel-display-id')).toBeVisible();
    await expect(page.getByTestId('fuel-status')).toHaveText('POSTED');
    await expect(page.getByTestId('fuel-total-amount')).toContainText('100.00 USD');
    await expect(page.getByTestId('fuel-odometer')).toHaveText('20500 km');

    // 5. Fuel Purchase #2: trigger ODOMETER_REGRESSION anomaly (logging 20300 km after 20500 km)
    await page.goto('/fuel/new');
    await page.getByTestId('input-vehicle').selectOption(vehicleId);
    await page.getByTestId('input-quantity').fill('30');
    await page.getByTestId('input-unit-price').fill('2.10');
    await page.getByTestId('input-currency').fill('USD');
    await page.getByTestId('input-odometer').fill('20300'); // Regression!
    await page.getByTestId('input-station').fill('Chevron Highway Station');
    await page.getByTestId('input-reference').fill(`REC-REGRESS-${timestamp}`);
    await page.getByTestId('submit-fuel').click();

    await expect(page).toHaveURL(/\/fuel\/[0-9a-f-]+/u);
    // Verify Anomaly is detected and flagged on page!
    await expect(page.getByTestId('anomalies-list')).toBeVisible();
    await expect(page.getByTestId('anomalies-list')).toContainText('ODOMETER_REGRESSION');

    // 6. Void Fuel Transaction #2 with reason
    await page.getByTestId('btn-void-transaction').click();
    await expect(page.getByTestId('void-modal')).toBeVisible();
    await page.getByTestId('input-void-reason').fill('Driver entered typo in odometer reading');
    await page.getByTestId('confirm-void-btn').click();

    await expect(page.getByTestId('fuel-status')).toHaveText('VOIDED');
    await expect(page.getByTestId('void-reason-banner')).toContainText(
      'Driver entered typo in odometer reading',
    );

    // 7. CSV Fuel Import Flow
    await page.goto('/fuel/import');
    await expect(page.getByTestId('import-title')).toBeVisible();
    const csvData = `vehicleRegistration,occurredAt,quantity,unit,unitPrice,currencyCode,odometerKm,stationName,referenceNumber\n${vehicleReg},2026-10-30T12:00:00.000Z,40.0,LITERS,2.00,USD,21000,Exxon Depot,CSV-${timestamp}`;
    await page.getByTestId('textarea-csv-content').fill(csvData);
    await page.getByTestId('btn-preview-import').click();

    await expect(page.getByTestId('preview-section')).toBeVisible();
    await expect(page.getByTestId('preview-valid-count')).toHaveText('1 valid');
    await page.getByTestId('btn-confirm-import').click();
    await expect(page.getByTestId('import-success')).toContainText('Successfully imported 1');

    // Wait for redirect to /fuel
    await expect(page).toHaveURL(/\/fuel/u, { timeout: 10000 });
    await expect(page.getByTestId('fuel-table')).toBeVisible();

    // 8. Expense Flow: Create DRAFT Expense
    await page.goto('/expenses/new');
    await expect(page.getByTestId('new-expense-title')).toBeVisible();
    await page
      .getByTestId('input-category')
      .selectOption({ label: `Express Toll ${timestamp} (${catCode})` });
    await page.getByTestId('input-status').selectOption('DRAFT');
    await page.getByTestId('input-description').fill(`Draft Highway Toll - Interstate 35`);
    await page.getByTestId('input-amount').fill('15.50');
    await page.getByTestId('input-currency').fill('USD');
    await page.getByTestId('input-vendor').fill('Texas Toll Authority');
    await page.getByTestId('input-vehicle').selectOption(vehicleId);
    await page.getByTestId('submit-expense').click();

    await expect(page).toHaveURL(/\/expenses\/[0-9a-f-]+/u);

    await expect(page.getByTestId('expense-display-id')).toBeVisible();
    await expect(page.getByTestId('expense-status')).toHaveText('DRAFT');
    await expect(page.getByTestId('btn-edit-draft')).toBeVisible();
    await expect(page.getByTestId('btn-post-expense')).toBeVisible();

    // Edit Draft
    await page.getByTestId('btn-edit-draft').click();
    await expect(page.getByTestId('edit-draft-form')).toBeVisible();
    await page.getByTestId('edit-input-amount').fill('18.75');
    await page
      .getByTestId('edit-input-description')
      .fill('Updated Highway Toll - Interstate 35 Express');
    await page.getByTestId('btn-save-draft').click();

    await expect(page.getByTestId('expense-amount')).toContainText('18.75 USD');
    await expect(page.getByTestId('expense-description')).toHaveText(
      'Updated Highway Toll - Interstate 35 Express',
    );

    // Post Expense
    await page.getByTestId('btn-post-expense').click();
    await expect(page.getByTestId('expense-status')).toHaveText('POSTED');
    await expect(page.getByTestId('btn-void-expense')).toBeVisible();

    // Void Expense
    await page.getByTestId('btn-void-expense').click();
    await expect(page.getByTestId('void-modal')).toBeVisible();
    await page.getByTestId('input-void-reason').fill('Electronic transponder double-charged');
    await page.getByTestId('confirm-void-btn').click();

    await expect(page.getByTestId('expense-status')).toHaveText('VOIDED');
    await expect(page.getByTestId('void-reason-banner')).toContainText(
      'Electronic transponder double-charged',
    );

    // 9. Finance Dashboard: Check currency cards
    await page.goto('/finance');
    await expect(page.getByTestId('finance-title')).toBeVisible();
    await expect(page.getByTestId('currency-card-USD')).toBeVisible();
    await expect(page.getByTestId('fuel-total-USD')).toBeVisible();

    // 10. Vehicle Detail Page: Check Vehicle Finance & Fuel Economy KPIs
    await page.goto(`/vehicles/${vehicleId}`);
    await expect(page.getByTestId('section-vehicle-finance')).toBeVisible();
    await expect(page.getByTestId('vehicle-fuel-efficiency')).toBeVisible();
    await expect(page.getByTestId('metric-km-per-unit')).toBeVisible();
    await expect(page.getByTestId('metric-cost-per-km')).toBeVisible();
  });
});
