import crypto from 'node:crypto';
import fs from 'node:fs';

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

    // 4b. Receipt Flow: Upload fixture PDF, verify metadata, download content, immutability, and no raw storage key
    await expect(page.getByTestId('receipt-section')).toBeVisible();
    const fuelFixtureBuffer = Buffer.from(
      '%PDF-1.4 sample fuel receipt content deterministic bytes 12345',
    );
    await page.locator('input[type="file"]').setInputFiles({
      name: 'sample_fuel_receipt.pdf',
      mimeType: 'application/pdf',
      buffer: fuelFixtureBuffer,
    });
    await page.getByTestId('btn-upload-receipt').click();
    await expect(page.getByTestId('attached-receipt-name')).toContainText(
      'sample_fuel_receipt.pdf',
    );
    await expect(page.getByTestId('attached-receipt-meta')).toContainText('application/pdf');

    // Real Browser Download: Trigger download, request presigned URL, verify downloaded bytes match fixture exactly
    const [fuelDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('btn-download-receipt').click(),
    ]);
    const fuelDownloadPath = await fuelDownload.path();
    expect(fuelDownloadPath).toBeTruthy();
    const downloadedFuelBytes = fs.readFileSync(fuelDownloadPath!);
    expect(downloadedFuelBytes).toEqual(fuelFixtureBuffer);
    const fuelSha256 = crypto.createHash('sha256').update(downloadedFuelBytes).digest('hex');
    const expectedFuelSha = crypto.createHash('sha256').update(fuelFixtureBuffer).digest('hex');
    expect(fuelSha256).toBe(expectedFuelSha);

    // Immutability: upload form is no longer rendered
    await expect(page.getByTestId('upload-receipt-form')).not.toBeVisible();

    // Verify raw MinIO key and raw bucket URL are not rendered in page HTML
    const fuelPageHtml = await page.content();
    expect(fuelPageHtml).not.toContain('receipts/');
    expect(fuelPageHtml).not.toContain('vehicle-management/');
    expect(fuelPageHtml).not.toContain('localhost:9000');

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

    // 8b. Expense Receipt: Upload fixture PDF while in DRAFT, download and verify bytes, post expense, verify immutability
    await expect(page.getByTestId('receipt-section')).toBeVisible();
    const expenseFixtureBuffer = Buffer.from(
      '%PDF-1.4 sample expense receipt content deterministic bytes 67890',
    );
    await page.locator('input[type="file"]').setInputFiles({
      name: 'sample_expense_receipt.pdf',
      mimeType: 'application/pdf',
      buffer: expenseFixtureBuffer,
    });
    await page.getByTestId('btn-upload-receipt').click();
    await expect(page.getByTestId('attached-receipt-name')).toContainText(
      'sample_expense_receipt.pdf',
    );

    // Real Browser Download: Trigger download for expense receipt
    const [expenseDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('btn-download-receipt').click(),
    ]);
    const expenseDownloadPath = await expenseDownload.path();
    expect(expenseDownloadPath).toBeTruthy();
    const downloadedExpenseBytes = fs.readFileSync(expenseDownloadPath!);
    expect(downloadedExpenseBytes).toEqual(expenseFixtureBuffer);
    const expenseSha256 = crypto.createHash('sha256').update(downloadedExpenseBytes).digest('hex');
    const expectedExpenseSha = crypto
      .createHash('sha256')
      .update(expenseFixtureBuffer)
      .digest('hex');
    expect(expenseSha256).toBe(expectedExpenseSha);

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

    // Immutability after post: upload form is gone
    await expect(page.getByTestId('upload-receipt-form')).not.toBeVisible();
    const expPageHtml = await page.content();
    expect(expPageHtml).not.toContain('receipts/');
    expect(expPageHtml).not.toContain('vehicle-management/');
    expect(expPageHtml).not.toContain('localhost:9000');

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

  test('enforces RBAC permissions: Dev Viewer has read-only finance access and action buttons are hidden', async ({
    page,
  }) => {
    // 1. Switch to Dev Viewer
    await page.goto('/finance');
    const switchViewerBtn = page.getByTestId('auth-viewer-btn');
    await expect(switchViewerBtn).toBeVisible();
    await switchViewerBtn.click();
    await expect(page.getByTestId('user-badge')).toContainText('Development Viewer');

    // 2. Finance Dashboard is accessible in read-only mode
    await expect(page.getByTestId('finance-title')).toBeVisible();

    // 3. Fuel transactions page: "+ Log Fuel" and "Import CSV" buttons must be hidden for viewer
    await page.goto('/fuel');
    await expect(page.getByTestId('fuel-title')).toBeVisible();
    await expect(page.getByTestId('btn-log-fuel')).not.toBeVisible();
    await expect(page.getByTestId('btn-import-csv')).not.toBeVisible();

    // 3b. Detail page read-only inspection: click first transaction and verify action buttons & receipt download are hidden
    const firstRowLink = page.locator('[data-testid^="link-fuel-"]').first();
    if (await firstRowLink.isVisible()) {
      await firstRowLink.click();
      await expect(page.getByTestId('fuel-display-id')).toBeVisible();
      await expect(page.getByTestId('btn-void-transaction')).not.toBeVisible();
      await expect(page.getByTestId('upload-receipt-form')).not.toBeVisible();
      await expect(page.getByTestId('btn-download-receipt')).not.toBeVisible();
    }

    // 4. Expenses page: "+ New Expense" button must be hidden for viewer
    await page.goto('/expenses');
    await expect(page.getByTestId('expenses-title')).toBeVisible();
    await expect(page.getByTestId('btn-new-expense')).not.toBeVisible();

    // 5. Expense categories page: "Create Category" form must be hidden for viewer
    await page.goto('/expense-categories');
    await expect(page.getByTestId('categories-title')).toBeVisible();
    await expect(page.getByTestId('btn-create-category')).not.toBeVisible();

    // 6. Restore Admin session
    await page.getByTestId('auth-admin-btn').click();
    await expect(page.getByTestId('user-badge')).toContainText('Development Admin');
  });

  test('exercises trip cost attribution and currency-segregated financial reporting with zero FX conversion', async ({
    page,
  }) => {
    test.setTimeout(90000);

    const timestamp = Date.now().toString().slice(-6);
    const vehicleDisplayId = `V-TRIP-${timestamp}`;
    const vehicleReg = `TR-${timestamp.slice(-4)}TX`;
    const safeTag = timestamp
      .toUpperCase()
      .replace(/[^A-HJ-NPR-Z0-9]/g, 'X')
      .slice(-6)
      .padStart(6, '0');
    const vehicleVin = `1HGCR2F83MB${safeTag}`;

    // 1. Create and activate vehicle
    await page.goto('/vehicles/new');
    await page.getByTestId('input-display-id').fill(vehicleDisplayId);
    await page.getByTestId('input-registration').fill(vehicleReg);
    await page.getByTestId('input-vin').fill(vehicleVin);
    await page.getByTestId('input-model').fill('Freightliner Cascadia');
    await page.getByTestId('select-type').selectOption('TRUCK');
    await page.getByTestId('select-fuel-type').selectOption('DIESEL');
    await page.getByTestId('input-year').fill('2024');
    await page.getByTestId('input-odometer').fill('50000');
    await page.getByTestId('submit-vehicle').click();
    await expect(page).toHaveURL(/\/vehicles\/[0-9a-f-]+/u);
    const vehicleId = page.url().split('/').pop()!;
    await page.getByTestId('activate-vehicle-btn').click();
    await expect(page.getByTestId('detail-status')).toHaveText('ACTIVE');

    // 2. Create driver and add license, then activate
    await page.goto('/drivers/new');
    const driverDisplayId = `D-TRIP-${timestamp}`;
    const empNumber = `EMP-${timestamp}`;
    await page.getByTestId('display-id-input').fill(driverDisplayId);
    await page.getByTestId('employee-number-input').fill(empNumber);
    await page.getByTestId('first-name-input').fill('Sarah');
    await page.getByTestId('last-name-input').fill('Connor');
    await page.getByTestId('email-input').fill(`sarah.${timestamp}@example.test`);
    await page.getByTestId('phone-input').fill('+1-555-0199');
    await page.getByTestId('submit-driver-button').click();
    await expect(page).toHaveURL(/\/drivers\/[0-9a-f-]+/u);
    const driverId = page.url().split('/').pop()!;

    // Add driver license
    await page.getByTestId('add-license-button').click();
    await page.getByTestId('license-number-input').fill(`DL-${timestamp}`);
    await page.getByTestId('license-country-input').fill('US');
    await page.getByTestId('license-region-input').fill('CA');
    await page.getByTestId('license-classes-input').fill('B, C');
    await page.getByTestId('license-issue-date-input').fill('2024-01-01');
    await page.getByTestId('license-expiry-date-input').fill('2030-01-01');
    await page.getByTestId('save-license-button').click();
    await expect(page.getByTestId('licenses-table')).toContainText(`DL-${timestamp}`);

    // Activate driver
    await page.getByTestId('activate-driver-button').click();
    await expect(page.getByTestId('driver-status-badge-active')).toBeVisible();

    // 3. Create active assignment
    await page.goto('/assignments/new');
    await page.getByTestId('vehicle-select').selectOption(vehicleId);
    await page.getByTestId('driver-select').selectOption(driverId);
    await page.getByTestId('submit-assignment-button').click();
    await expect(page).toHaveURL(/\/assignments\/[0-9a-f-]+/u);
    const assignmentId = page.url().split('/').pop()!;

    // 4. Create trip
    await page.goto('/trips/new');
    await page.getByTestId('assignment-select').selectOption(assignmentId);
    await page.getByTestId('origin-input').fill('Long Beach Port');
    await page.getByTestId('destination-input').fill('Reno Logistics Center');
    await page.getByTestId('submit-trip-btn').click();
    await expect(page).toHaveURL(/\/trips\/[0-9a-f-]+/u);
    const tripId = page.url().split('/').pop()!;

    // 5. Log Fuel transaction attributed to this trip in USD
    await page.goto('/fuel/new');
    await page.getByTestId('input-vehicle').selectOption(vehicleId);
    await page.getByTestId('input-trip').fill(tripId);
    await page.getByTestId('input-quantity').fill('60');
    await page.getByTestId('input-unit-price').fill('1.50');
    await page.getByTestId('input-currency').fill('USD');
    await page.getByTestId('input-odometer').fill('50400');
    await page.getByTestId('submit-fuel').click();
    await expect(page).toHaveURL(/\/fuel\/[0-9a-f-]+/u);
    await expect(page.getByTestId('fuel-total-amount')).toContainText('90.00 USD');

    // 6. Log an Expense attributed to this trip in USD
    await page.goto('/expenses/new');
    await page.getByTestId('input-trip').fill(tripId);
    await page.getByTestId('input-status').selectOption('POSTED');
    await page.getByTestId('input-description').fill('Truck scale weighing fee');
    await page.getByTestId('input-amount').fill('25.00');
    await page.getByTestId('input-currency').fill('USD');
    await page.getByTestId('input-vendor').fill('Weigh Station #4');
    await page.getByTestId('submit-expense').click();
    await expect(page).toHaveURL(/\/expenses\/[0-9a-f-]+/u);
    await expect(page.getByTestId('expense-status')).toHaveText('POSTED');

    // 7. Log a second transaction in JPY for multi-currency segregation testing
    await page.goto('/fuel/new');
    await page.getByTestId('input-vehicle').selectOption(vehicleId);
    await page.getByTestId('input-quantity').fill('20');
    await page.getByTestId('input-unit-price').fill('160');
    await page.getByTestId('input-currency').fill('JPY');
    await page.getByTestId('submit-fuel').click();
    await expect(page).toHaveURL(/\/fuel\/[0-9a-f-]+/u);
    await expect(page.getByTestId('fuel-total-amount')).toContainText('3200');
    await expect(page.getByTestId('fuel-total-amount')).toContainText('JPY');

    // 8. Verify Trip Finance Section on Trip Detail Page
    await page.goto(`/trips/${tripId}`);
    await expect(page.getByTestId('section-trip-finance')).toBeVisible();
    await expect(page.getByTestId('trip-cost-totals')).toBeVisible();
    await expect(page.getByTestId('trip-fuel-table')).toBeVisible();
    await expect(page.getByTestId('trip-expenses-table')).toBeVisible();

    // 9. Verify Multi-Currency Dashboard at /finance
    await page.goto('/finance');
    await expect(page.getByTestId('finance-title')).toBeVisible();
    await expect(page.getByTestId('currency-card-USD')).toBeVisible();
    await expect(page.getByTestId('currency-card-JPY')).toBeVisible();

    // Zero FX conversion verification: USD and JPY are segregated in distinct cards
    await expect(page.getByTestId('fuel-total-USD')).toBeVisible();
    await expect(page.getByTestId('fuel-total-JPY')).toBeVisible();
    await expect(page.getByTestId('grand-total-USD')).toContainText('USD');
    await expect(page.getByTestId('grand-total-JPY')).toContainText('JPY');
  });
});
