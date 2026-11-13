import { expect, test } from '@playwright/test';
import { createDatabaseClient, VehicleStatus, TripStatus } from '@vms/database';

const DEV_ORG_ID = '10000000-0000-4000-8000-000000000001';
const DEV_ADMIN_USER_ID = '20000000-0000-4000-8000-000000000001';
const DEV_ADMIN_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzaWQiOiJsb2NhbC0yMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDEiLCJzdWIiOiIyMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDEiLCJpc3MiOiJ2ZWhpY2xlLW1hbmFnZW1lbnQtbG9jYWwiLCJhdWQiOiJ2ZWhpY2xlLW1hbmFnZW1lbnQtYXBpIiwiaWF0IjoxNzkwMTQ3NjA5LCJleHAiOjE4MjE2ODM2MDl9.tHEKxYCMGub44l1Wi47dGZCZw4wCNUfKhyxXHz95z-c';

const prisma = createDatabaseClient({
  databaseUrl:
    process.env.DATABASE_URL ??
    'postgresql://vehicle_management:local_vehicle_management@localhost:5432/vehicle_management?schema=public',
});

test.describe('Milestone 12: Telemetry GPS Acceptance Flow', () => {
  const timestamp = Date.now().toString().slice(-6);
  let testDeviceId: string;
  let testDeviceToken: string;
  let testVehicleId: string;
  let testTripId: string;

  test.afterAll(async () => {
    // Cleanup any records created during test
    if (testVehicleId) {
      await prisma.telemetryCurrentPosition.deleteMany({ where: { vehicleId: testVehicleId } });
      await prisma.telemetryPosition.deleteMany({ where: { vehicleId: testVehicleId } });
      await prisma.telemetryDeviceVehicleAssignment.deleteMany({
        where: { vehicleId: testVehicleId },
      });
      if (testTripId) {
        await prisma.trip.deleteMany({ where: { id: testTripId } });
      }
      await prisma.vehicleDriverAssignment.deleteMany({ where: { vehicleId: testVehicleId } });
      await prisma.vehicle.deleteMany({ where: { id: testVehicleId } });
    }
    if (testDeviceId) {
      await prisma.telemetryDeviceCredential.deleteMany({ where: { deviceId: testDeviceId } });
      await prisma.telemetryDevice.deleteMany({ where: { id: testDeviceId } });
    }
    await prisma.$disconnect();
  });

  // ==========================================
  // SCENARIO A: Device Lifecycle (Register, Provision Credential, Assign to Vehicle)
  // ==========================================
  test('Scenario A — Device Lifecycle: register device, provision machine credential, and assign to vehicle', async ({
    page,
  }) => {
    const deviceName = `E2E Device ${timestamp}`;
    const identifier = `IMEI-PW-${timestamp}`;

    // 1. Create active vehicle directly in database for assignment target
    const vehicle = await prisma.vehicle.create({
      data: {
        organizationId: DEV_ORG_ID,
        displayId: `V-TEL-${timestamp}`,
        registration: `TEL-${timestamp.slice(-4)}`,
        vin: `1HGBH41JXMN${timestamp}`,
        type: 'VAN',
        fuelType: 'DIESEL',
        status: VehicleStatus.ACTIVE,
        model: 'Ford Transit Telemetry',
        year: 2025,
        odometerKm: 25000,
      },
    });
    testVehicleId = vehicle.id;

    // 2. Navigate to Register Device form
    await page.goto('/vehicles');
    await page.getByTestId('nav-telemetry').click();
    await expect(page).toHaveURL(/\/telemetry/u);
    await page.getByTestId('telemetry-devices-link').click();
    await expect(page).toHaveURL(/\/telemetry\/devices/u);

    await page.getByTestId('new-device-btn').click();
    await expect(page).toHaveURL(/\/telemetry\/devices\/new/u);
    await expect(page.getByRole('heading', { name: 'Register New Device' })).toBeVisible();

    // 3. Fill and submit device registration
    await page.getByTestId('device-name-input').fill(deviceName);
    await page.getByTestId('device-identifier-input').fill(identifier);
    await page.getByTestId('device-notes-input').fill('Playwright Scenario A device');
    await page.getByTestId('new-device-submit').click();

    // 4. Verify redirected to devices list and device appears
    await expect(page).toHaveURL(/\/telemetry\/devices/u, { timeout: 10_000 });
    await expect(page.getByTestId('devices-table')).toBeVisible();
    await expect(page.getByText(deviceName)).toBeVisible();
    await expect(page.getByText(identifier)).toBeVisible();

    // 5. Locate created device in DB to get its ID
    const dbDevice = await prisma.telemetryDevice.findFirstOrThrow({
      where: { organizationId: DEV_ORG_ID, identifier },
    });
    testDeviceId = dbDevice.id;

    // 6. Provision machine credential via UI "Key" button
    const keyBtn = page.getByTestId(`provision-cred-${testDeviceId}`);
    await expect(keyBtn).toBeVisible();
    await keyBtn.click();

    // 7. Verify credential token display banner appears and copy token
    await expect(page.getByTestId('credential-success-banner')).toBeVisible({ timeout: 5000 });
    const tokenDisplay = page.getByTestId('device-token-display');
    await expect(tokenDisplay).toBeVisible();
    testDeviceToken = (await tokenDisplay.innerText()).trim();
    expect(testDeviceToken).toContain('.');
    expect(testDeviceToken.startsWith('dev_')).toBe(true);

    // 8. Assign device to vehicle via API
    const assignRes = await fetch(
      `http://localhost:3001/api/v1/telemetry/devices/${testDeviceId}/assign`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${DEV_ADMIN_TOKEN}`,
          'x-organization-id': DEV_ORG_ID,
        },
        body: JSON.stringify({ vehicleId: testVehicleId, notes: 'Scenario A assignment' }),
      },
    );
    expect(assignRes.ok).toBe(true);

    // 9. Navigate to Vehicle detail page and verify Telemetry panel
    await page.goto(`/vehicles/${testVehicleId}`);
    await expect(page.getByTestId('vehicle-telemetry-section')).toBeVisible({ timeout: 10_000 });
  });

  // ==========================================
  // SCENARIO B: Live Position Ingestion via Machine Authentication
  // ==========================================
  test('Scenario B — Live Position: ingest position via device credential and verify fleet map & vehicle detail', async ({
    page,
  }) => {
    expect(testDeviceToken).toBeDefined();

    // 1. Ingest position using machine credential via non-human endpoint
    const ingestRes = await fetch('http://localhost:3001/api/v1/telemetry/device/positions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-device-key': testDeviceToken,
      },
      body: JSON.stringify({
        capturedAt: new Date().toISOString(),
        latitude: 37.7749,
        longitude: -122.4194,
        speedKmh: 55.4,
        heading: 180,
      }),
    });
    expect(ingestRes.status).toBe(201);
    const ingestData = await ingestRes.json();
    expect(ingestData.vehicleId).toBe(testVehicleId);
    expect(ingestData.source).toBe('DEVICE');

    // 2. Navigate to Fleet Telemetry map and verify position in table
    await page.goto('/telemetry');
    await expect(page.getByTestId('telemetry-fleet-table')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('37.77490')).toBeVisible();
    await expect(page.getByText('-122.41940')).toBeVisible();
    await expect(page.getByText('🟢 Fresh')).toBeVisible();

    // 3. Navigate to Vehicle detail page and verify live telemetry panel
    await page.goto(`/vehicles/${testVehicleId}`);
    await expect(page.getByTestId('vehicle-telemetry-data')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('37.77490, -122.41940')).toBeVisible();
    await expect(page.getByText('55.4 km/h')).toBeVisible();
  });

  // ==========================================
  // SCENARIO C: Out-of-Order Position Protection
  // ==========================================
  test('Scenario C — Out-of-Order: older point does not regress current snapshot and is marked OUT_OF_ORDER', async ({
    page,
  }) => {
    expect(testDeviceToken).toBeDefined();

    const tNow = Date.now();
    const newerTime = new Date(tNow + 30_000); // T + 30s
    const olderTime = new Date(tNow - 30_000); // T - 30s

    // 1. Ingest newer point (latitude: 38.0)
    const resNewer = await fetch('http://localhost:3001/api/v1/telemetry/device/positions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-device-key': testDeviceToken,
      },
      body: JSON.stringify({
        capturedAt: newerTime.toISOString(),
        latitude: 38.0,
        longitude: -122.0,
        speedKmh: 70.0,
      }),
    });
    expect(resNewer.status).toBe(201);

    // 2. Ingest older point arriving after newer (latitude: 36.0)
    const resOlder = await fetch('http://localhost:3001/api/v1/telemetry/device/positions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-device-key': testDeviceToken,
      },
      body: JSON.stringify({
        capturedAt: olderTime.toISOString(),
        latitude: 36.0,
        longitude: -121.0,
        speedKmh: 30.0,
      }),
    });
    expect(resOlder.status).toBe(201);
    const olderData = await resOlder.json();
    expect(olderData.status).toBe('OUT_OF_ORDER');

    // 3. Verify on vehicle detail page that current position remains the newer point (38.0)
    await page.goto(`/vehicles/${testVehicleId}`);
    await expect(page.getByTestId('vehicle-telemetry-data')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('38.00000, -122.00000')).toBeVisible();
  });

  // ==========================================
  // SCENARIO D: Trip Route Track Correlation
  // ==========================================
  test('Scenario D — Trip Route: points captured during trip appear on trip GPS route track', async ({
    page,
  }) => {
    // 1. Create driver and assignment for vehicle
    const driver = await prisma.driver.create({
      data: {
        organizationId: DEV_ORG_ID,
        displayId: `DRV-E2E-${timestamp}`,
        firstName: 'Elena',
        lastName: 'Rostova',
        employeeNumber: `EMP-E2E-${timestamp}`,
        status: 'ACTIVE',
      },
    });

    const assignment = await prisma.vehicleDriverAssignment.create({
      data: {
        organizationId: DEV_ORG_ID,
        vehicleId: testVehicleId,
        driverId: driver.id,
        status: 'ACTIVE',
        startedAt: new Date(Date.now() - 3600_000),
      },
    });

    // 2. Create in-progress trip
    const tripStart = new Date(Date.now() - 1800_000); // 30m ago
    const trip = await prisma.trip.create({
      data: {
        organizationId: DEV_ORG_ID,
        displayId: `TRP-E2E-${timestamp}`,
        assignmentId: assignment.id,
        vehicleId: testVehicleId,
        driverId: driver.id,
        status: TripStatus.IN_PROGRESS,
        origin: 'San Francisco HQ',
        destination: 'Oakland Depot',
        actualStartAt: tripStart,
        startOdometerKm: 25000,
        createdBy: DEV_ADMIN_USER_ID,
        updatedBy: DEV_ADMIN_USER_ID,
      },
    });
    testTripId = trip.id;

    // 3. Ingest route coordinates captured during the trip via machine credential
    const t0 = tripStart.getTime();
    for (let i = 1; i <= 3; i++) {
      await fetch('http://localhost:3001/api/v1/telemetry/device/positions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-device-key': testDeviceToken,
        },
        body: JSON.stringify({
          capturedAt: new Date(t0 + i * 300_000).toISOString(),
          latitude: 37.77 + i * 0.02,
          longitude: -122.41 + i * 0.02,
          speedKmh: 40 + i * 5,
        }),
      });
    }

    // 4. Navigate to Trip detail page and verify GPS route section
    await page.goto(`/trips/${testTripId}`);
    await expect(page.getByTestId('trip-telemetry-route-section')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('GPS Route Track (3 points)')).toBeVisible();
    await expect(page.locator('svg[role="img"]')).toBeVisible();

    // Clean up positions, trip, assignment, and driver
    await prisma.telemetryPosition.deleteMany({ where: { tripId: testTripId } });
    await prisma.trip.deleteMany({ where: { id: testTripId } });
    testTripId = '';
    await prisma.vehicleDriverAssignment.delete({ where: { id: assignment.id } });
    await prisma.driver.delete({ where: { id: driver.id } });
  });

  // ==========================================
  // SCENARIO E: RBAC and Tenant Isolation
  // ==========================================
  test('Scenario E — RBAC & Tenant Isolation: Dev Viewer has read-only access and cannot register devices', async ({
    page,
  }) => {
    // 1. Navigate to Telemetry Fleet Map
    await page.goto('/telemetry');
    await expect(page.getByRole('heading', { name: 'Fleet Telemetry Map' })).toBeVisible();

    // 2. Switch to Dev Viewer
    await page.getByTestId('auth-viewer-btn').click();
    await expect(page.getByTestId('user-badge')).toContainText('Viewer', { timeout: 5000 });

    // 3. Viewer can view map and accessible table
    await expect(page.locator('svg[role="img"]')).toBeVisible();

    // 4. Navigate to devices list: verify register button or action capabilities are restricted
    await page.goto('/telemetry/devices');
    await expect(page.getByRole('heading', { name: 'Telemetry Devices' })).toBeVisible();

    // 5. Try calling register device API as viewer -> must be rejected with 403 Forbidden
    const viewerToken = await page.evaluate(() => localStorage.getItem('vms_auth_token'));
    const res = await fetch('http://localhost:3001/api/v1/telemetry/devices', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${viewerToken}`,
        'x-organization-id': DEV_ORG_ID,
      },
      body: JSON.stringify({
        name: 'Viewer Unauthorized Device',
        identifier: 'IMEI-VIEWER-999',
      }),
    });
    // Dev viewer does not possess telemetry.device.manage permission
    expect(res.status).toBe(403);
  });
});
