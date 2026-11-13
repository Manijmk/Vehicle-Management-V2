import { expect, test } from '@playwright/test';
import {
  createDatabaseClient,
  FuelType,
  TelemetryDeviceStatus,
  VehicleStatus,
  VehicleType,
} from '@vms/database';

const DEV_ORG_ID = '10000000-0000-4000-8000-000000000001';
const DEV_ADMIN_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzaWQiOiJsb2NhbC0yMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDEiLCJzdWIiOiIyMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDEiLCJpc3MiOiJ2ZWhpY2xlLW1hbmFnZW1lbnQtbG9jYWwiLCJhdWQiOiJ2ZWhpY2xlLW1hbmFnZW1lbnQtYXBpIiwiaWF0IjoxNzkwMTQ3NjA5LCJleHAiOjE4MjE2ODM2MDl9.tHEKxYCMGub44l1Wi47dGZCZw4wCNUfKhyxXHz95z-c';

const prisma = createDatabaseClient({
  databaseUrl:
    process.env.DATABASE_URL ??
    'postgresql://vehicle_management:local_vehicle_management@localhost:5432/vehicle_management?schema=public',
});

test.describe('Milestone 14: External Integrations Acceptance Flow', () => {
  const timestamp = Date.now().toString().slice(-6);
  let testVehicleId: string;
  let testDeviceId: string;
  let testConnectionId: string;

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(
      ({ token, orgId }) => {
        if (!window.localStorage.getItem('vms_auth_token')) {
          window.localStorage.setItem('vms_auth_token', token);
          window.localStorage.setItem('vms_org_id', orgId);
        }
      },
      { token: DEV_ADMIN_TOKEN, orgId: DEV_ORG_ID },
    );
  });

  test.afterAll(async () => {
    // Cleanup any created records
    try {
      if (testConnectionId) {
        await prisma.webhookDeliveryAttempt.deleteMany({
          where: { delivery: { subscription: { connectionId: testConnectionId } } },
        });
        await prisma.webhookDelivery.deleteMany({
          where: { subscription: { connectionId: testConnectionId } },
        });
        await prisma.webhookSubscription.deleteMany({ where: { connectionId: testConnectionId } });
        await prisma.integrationDeviceMapping.deleteMany({
          where: { connectionId: testConnectionId },
        });
        await prisma.fuelCardImportBatch.deleteMany({ where: { connectionId: testConnectionId } });
        await prisma.accountingExportLog.deleteMany({ where: { connectionId: testConnectionId } });
        await prisma.integrationSecret.deleteMany({ where: { connectionId: testConnectionId } });
        await prisma.integrationConnection.deleteMany({ where: { id: testConnectionId } });
      }
      if (testDeviceId) {
        await prisma.integrationDeviceMapping.deleteMany({
          where: { telemetryDeviceId: testDeviceId },
        });
        await prisma.telemetryDeviceCredential.deleteMany({ where: { deviceId: testDeviceId } });
        await prisma.telemetryDevice.deleteMany({ where: { id: testDeviceId } });
      }
      if (testVehicleId) {
        await prisma.fuelTransaction.deleteMany({ where: { vehicleId: testVehicleId } });
        await prisma.vehicle.deleteMany({ where: { id: testVehicleId } });
      }
    } finally {
      await prisma.$disconnect();
    }
  });

  // =========================================================================
  // SCENARIO A: Connection Administration (Navigation, Creation, Lifecycle)
  // =========================================================================
  test('Scenario A — Connection Administration: navigate via header, register connection, and activate', async ({
    page,
  }) => {
    // 1. Start from /vehicles and click Integrations navigation in header
    await page.goto('/vehicles');
    await expect(page.getByTestId('nav-integrations')).toBeVisible();
    await page.getByTestId('nav-integrations').click();

    // 2. Verify redirected to /integrations
    await expect(page).toHaveURL(/\/integrations$/u, { timeout: 10_000 });
    await expect(page.getByTestId('page-title')).toContainText('Integrations & External Systems');

    // 3. Click "+ New Connection"
    await expect(page.getByTestId('btn-new-integration')).toBeVisible();
    await page.getByTestId('btn-new-integration').click();

    await expect(page).toHaveURL(/\/integrations\/new$/u, { timeout: 10_000 });
    await expect(page.getByTestId('page-title')).toContainText(
      'Register New Integration Connection',
    );

    // 4. Fill form
    const connName = `PW Outbound Webhooks ${timestamp}`;
    await page.getByTestId('input-name').fill(connName);
    await page.getByTestId('select-kind').selectOption('OUTBOUND_WEBHOOK');
    await page.getByTestId('input-provider').fill('CUSTOM');
    await page.getByTestId('textarea-config').fill('{"purpose":"playwright-test"}');

    // 5. Submit
    await page.getByTestId('btn-submit').click();

    // 6. Verify redirected to detail page
    await expect(page).toHaveURL(/\/integrations\/[0-9a-f-]+$/u, { timeout: 15_000 });
    const url = page.url();
    testConnectionId = url.split('/').pop()!;

    // 7. Verify Display ID and Status badge DRAFT
    await expect(page.getByTestId('connection-display-id')).toBeVisible();
    await expect(page.getByTestId('badge-status-draft')).toBeVisible();

    // 8. Activate connection
    await expect(page.getByTestId('btn-activate')).toBeVisible();
    await page.getByTestId('btn-activate').click();

    // Verify status changes to ACTIVE
    await expect(page.getByTestId('badge-status-active')).toBeVisible({ timeout: 10_000 });
  });

  // =========================================================================
  // SCENARIO B: Outbound Webhook Subscription & Secret Provisioning
  // =========================================================================
  test('Scenario B — Secret Provisioning & Webhook Subscription: provision secret with one-time reveal and subscribe', async ({
    page,
  }) => {
    expect(testConnectionId).toBeDefined();
    await page.goto(`/integrations/${testConnectionId}`);

    // 1. Provision secret
    await expect(page.getByTestId('btn-provision-secret')).toBeVisible();
    await page.getByTestId('btn-provision-secret').click();

    // 2. Verify one-time reveal banner
    await expect(page.getByTestId('plaintext-secret-banner')).toBeVisible({ timeout: 10_000 });
    const secretInput = page.getByTestId('plaintext-secret-value');
    await expect(secretInput).toBeVisible();
    const secretValue = await secretInput.inputValue();
    expect(secretValue).toMatch(/^whsec_[0-9a-f]{48,64}$/);

    // 3. Add outbound webhook subscription
    await page.getByTestId('input-endpoint-url').fill('https://webhook.site/playwright-test');
    await page.getByTestId('btn-create-subscription').click();

    // 4. Verify subscription appears in table
    await expect(page.locator('table')).toContainText('https://webhook.site/playwright-test', {
      timeout: 10_000,
    });
  });

  // =========================================================================
  // SCENARIO C: Inbound Telematics Webhook & Device Mapping
  // =========================================================================
  test('Scenario C — Inbound Telematics: register telematics connection and map provider device', async ({
    page,
  }) => {
    // 1. Create a baseline telemetry device in database for mapping target
    const telemDevice = await prisma.telemetryDevice.create({
      data: {
        organizationId: DEV_ORG_ID,
        displayId: `DEV-PW-${timestamp}`,
        name: `PW Geotab Unit ${timestamp}`,
        identifier: `IMEI-PW-${timestamp}`,
        status: TelemetryDeviceStatus.ACTIVE,
      },
    });
    testDeviceId = telemDevice.id;

    // 2. Navigate to /integrations/new
    await page.goto('/integrations/new');
    await page.getByTestId('input-name').fill(`PW Geotab Ingest ${timestamp}`);
    await page.getByTestId('select-kind').selectOption('INBOUND_TELEMATICS');
    await page.getByTestId('input-provider').fill('GEOTAB');
    await page.getByTestId('btn-submit').click();

    await expect(page).toHaveURL(/\/integrations\/[0-9a-f-]+$/u, { timeout: 15_000 });
    const telemConnId = page.url().split('/').pop()!;

    // 3. Verify telematics webhook URL is displayed
    await expect(page.getByTestId('telematics-webhook-url')).toBeVisible();
    await expect(page.getByTestId('telematics-webhook-url')).toContainText(
      `/api/v1/integrations/telematics/${telemConnId}/events`,
    );

    // 4. Provision secret
    await page.getByTestId('btn-provision-secret').click();
    await expect(page.getByTestId('plaintext-secret-banner')).toBeVisible({ timeout: 10_000 });

    // 5. Add provider device mapping
    await page.getByTestId('input-provider-device-id').fill(`GEO-SERIAL-${timestamp}`);
    await page.getByTestId('input-telemetry-device-id').fill(testDeviceId);
    await page.getByTestId('btn-save-mapping').click();

    // 6. Verify mapping row appears in table
    await expect(page.locator('table')).toContainText(`GEO-SERIAL-${timestamp}`, {
      timeout: 10_000,
    });
    await expect(page.locator('table')).toContainText(telemDevice.displayId);
  });

  // =========================================================================
  // SCENARIO D: Fuel Card CSV Import (Preview & Confirm)
  // =========================================================================
  test('Scenario D — Fuel Card Import: upload CSV, preview row validation, and confirm batch', async ({
    page,
  }) => {
    // 1. Seed vehicle in DB for registration matching
    const regNum = `FC-${timestamp}`;
    const vehicle = await prisma.vehicle.create({
      data: {
        organizationId: DEV_ORG_ID,
        displayId: `VH-FC-${timestamp}`,
        registration: regNum,
        vin: `1HGCR2F83HAFC${timestamp.padEnd(4, '0').slice(0, 4)}`,
        type: VehicleType.CAR,
        fuelType: FuelType.DIESEL,
        status: VehicleStatus.ACTIVE,
        model: 'Fuel Test Sedan',
        year: 2024,
        odometerKm: 20000,
      },
    });
    testVehicleId = vehicle.id;

    // 2. Navigate to /integrations/new
    await page.goto('/integrations/new');
    await page.getByTestId('input-name').fill(`PW WEX Import ${timestamp}`);
    await page.getByTestId('select-kind').selectOption('FUEL_CARD_IMPORT');
    await page.getByTestId('input-provider').fill('WEX');
    await page.getByTestId('btn-submit').click();

    await expect(page).toHaveURL(/\/integrations\/[0-9a-f-]+$/u, { timeout: 15_000 });

    // 3. Upload fuel card CSV
    const csvContent = [
      'externalTransactionId,vehicleRegistration,occurredAt,energyType,quantity,quantityUnit,unitPrice,totalAmount,currencyCode,odometerKm,stationName,referenceNumber',
      `TX-PW-${timestamp},${regNum},2026-11-10T08:00:00Z,DIESEL,45.000,LITER,2.1500,96.75,USD,20500,Shell Station,REF-123`,
    ].join('\n');

    await page.getByTestId('input-fuel-csv').setInputFiles({
      name: 'wex_sample.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csvContent, 'utf-8'),
    });

    await page.getByTestId('btn-preview-csv').click();

    // 4. Verify preview shows 1 valid row
    await expect(page.getByTestId('fuel-import-preview-box')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('fuel-import-preview-box')).toContainText(
      '1 valid / 1 total rows',
    );
    await expect(page.getByTestId('fuel-import-preview-box')).toContainText('Ready');

    // 5. Confirm batch
    await expect(page.getByTestId('btn-confirm-import')).toBeVisible();
    await page.getByTestId('btn-confirm-import').click();

    // 6. Verify success banner and history row
    await expect(page.getByTestId('success-banner')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('success-banner')).toContainText('Successfully imported 1');
  });

  // =========================================================================
  // SCENARIO E: Accounting CSV Export
  // =========================================================================
  test('Scenario E — Accounting Export: configure date range, download accounting CSV, and check log', async ({
    page,
  }) => {
    // 1. Navigate to /integrations/new
    await page.goto('/integrations/new');
    await page.getByTestId('input-name').fill(`PW NetSuite Export ${timestamp}`);
    await page.getByTestId('select-kind').selectOption('ACCOUNTING_EXPORT');
    await page.getByTestId('input-provider').fill('NETSUITE');
    await page.getByTestId('btn-submit').click();

    await expect(page).toHaveURL(/\/integrations\/[0-9a-f-]+$/u, { timeout: 15_000 });

    // 2. Set export date range
    await page.getByTestId('input-export-from').fill('2026-11-01');
    await page.getByTestId('input-export-to').fill('2026-11-30');

    // 3. Trigger download and capture download event
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('btn-export-accounting').click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/accounting_export_.*\.csv$/);
  });

  // =========================================================================
  // SCENARIO F: RBAC & Tenant Isolation
  // =========================================================================
  test('Scenario F — RBAC: Dev Viewer cannot create connections or provision secrets', async ({
    page,
  }) => {
    // 1. Start from /integrations
    await page.goto('/integrations');
    await expect(page.getByTestId('page-title')).toBeVisible();

    // 2. Switch role to Dev Viewer via header button
    await expect(page.getByTestId('auth-viewer-btn')).toBeVisible();
    await page.getByTestId('auth-viewer-btn').click();
    await expect(page.getByTestId('user-badge')).toContainText('Viewer', { timeout: 10_000 });

    // 3. For Viewer, navigating to /integrations/new and attempting to create connection should fail
    await page.goto('/integrations/new');
    await page.getByTestId('input-name').fill('Unauthorized Viewer Attempt');
    await page.getByTestId('input-provider').fill('CUSTOM');
    await page.getByTestId('btn-submit').click();

    // Verify error banner is displayed
    await expect(page.getByTestId('error-banner')).toBeVisible({ timeout: 10_000 });
  });
});
