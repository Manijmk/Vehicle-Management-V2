import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

test.describe('Milestone 10: Incident Vertical Slice Acceptance Flow', () => {
  test('exercises complete Trip-linked Incident flow: in-progress trip linkage, non-blocking trip closure, subsequent dispatch blocking, real attachment download, maintenance integration, resolution unblocking, and closure', async ({
    page,
  }) => {
    test.setTimeout(120000);

    const timestamp = Date.now().toString().slice(-6);
    const vehicleDisplayId = `V-TRP-${timestamp}`;
    const vehicleReg = `TR-${timestamp.slice(-4)}TX`;
    const safeTag = timestamp
      .toUpperCase()
      .replace(/[^A-HJ-NPR-Z0-9]/g, 'X')
      .slice(-6)
      .padStart(6, '0');
    const vehicleVin = `1HGCR2F83MA${safeTag}`;

    const driverFirstName = `Alex${timestamp.slice(-3)}`;
    const driverLastName = `Morgan${timestamp.slice(-3)}`;
    const employeeNumber = `EMP-TRP-${timestamp}`;
    const licenseNumber = `LIC-TRP-${timestamp}`;

    // 0. Ensure dev session is authenticated
    await page.goto('/vehicles');
    await expect(page.getByRole('heading', { name: 'Vehicles', exact: true })).toBeVisible({
      timeout: 15000,
    });

    // 1. Create and activate an active vehicle
    await page.goto('/vehicles/new');
    await expect(page).toHaveTitle(/Vehicle Management System/u);
    await page.getByTestId('input-display-id').fill(vehicleDisplayId);
    await page.getByTestId('input-registration').fill(vehicleReg);
    await page.getByTestId('input-vin').fill(vehicleVin);
    await page.getByTestId('input-model').fill('Freightliner Cascadia');
    await page.getByTestId('select-type').selectOption('TRUCK');
    await page.getByTestId('select-fuel-type').selectOption('DIESEL');
    await page.getByTestId('input-year').fill('2025');
    await page.getByTestId('input-odometer').fill('50000');
    await page.getByTestId('submit-vehicle').click();

    await expect(page).toHaveURL(/\/vehicles\/[0-9a-f-]+/u);
    const vehicleId = page.url().split('/').pop()!;
    await page.getByTestId('activate-vehicle-btn').click();
    await expect(page.getByTestId('detail-status')).toHaveText('ACTIVE');

    // 2. Create and activate an eligible driver with valid qualifying license
    await page.goto('/drivers/new');
    await page.getByTestId('first-name-input').fill(driverFirstName);
    await page.getByTestId('last-name-input').fill(driverLastName);
    await page.getByTestId('employee-number-input').fill(employeeNumber);
    await page.getByTestId('email-input').fill(`alex.${timestamp}@example.test`);
    await page.getByTestId('phone-input').fill('+1-555-0388');
    await page.getByTestId('submit-driver-button').click();

    await expect(page).toHaveURL(/\/drivers\/[0-9a-f-]+/u);
    const driverId = page.url().split('/').pop()!;

    // Add qualifying driver license
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
    await page
      .getByTestId('notes-input')
      .fill('Active assignment for Incident Trip Gate Acceptance');
    await page.getByTestId('submit-assignment-button').click();

    await expect(page).toHaveURL(/\/assignments\/[0-9a-f-]+/u);
    const assignmentId = page.url().split('/').pop()!;
    await expect(page.getByTestId('assignment-status-badge-active')).toBeVisible();

    // 4. Plan initial trip
    await page.goto('/trips/new');
    await page.getByTestId('assignment-select').selectOption(assignmentId);
    await page.getByTestId('origin-input').fill('Regional Logistics Hub');
    await page.getByTestId('destination-input').fill('Central Supply Depot');
    await page.getByTestId('purpose-input').fill('Trip to be interrupted by incident');
    await page.getByTestId('submit-trip-btn').click();

    await expect(page).toHaveURL(/\/trips\/[0-9a-f-]+/u);
    const firstTripId = page.url().split('/').pop()!;
    await expect(page.getByTestId('trip-status')).toHaveText('DRAFT');

    // Mark Trip 1 READY
    await page.getByTestId('mark-ready-btn').click();
    await expect(page.getByTestId('trip-status')).toHaveText('READY');

    // Perform PRE_TRIP inspection to pass departure operational gate
    await expect(page.getByTestId('pre-trip-gate-card')).toBeVisible();
    await page.getByTestId('start-pre-trip-inspection-btn').click();
    await expect(page).toHaveURL(/\/inspections\/new/u);
    await page.getByTestId('submit-inspection-button').click();
    await expect(page).toHaveURL(/\/inspections\/[0-9a-f-]+/u);
    await page.getByTestId('start-inspection-button').click();
    await page.getByTestId('complete-inspection-button').click();
    await expect(page.getByTestId('inspection-result-badge')).toHaveText('PASS');

    // Return to Trip 1 and start it
    await page.goto(`/trips/${firstTripId}`);
    await expect(page.getByTestId('pre-trip-gate-card')).toContainText('Pre-Trip Inspection: PASS');
    await page.getByTestId('start-trip-btn').click();
    await expect(page.getByTestId('start-modal')).toBeVisible();
    await page.getByTestId('confirm-start-btn').click();
    await expect(page.getByTestId('trip-status')).toHaveText('IN_PROGRESS');

    // 5. Report Incident linked to the IN_PROGRESS trip with operational impact VEHICLE
    await page.goto('/incidents/new');
    const incidentTitle = `Debris collision on highway during Trip ${timestamp}`;
    await page.getByTestId('input-type').selectOption('ACCIDENT');
    await page.getByTestId('input-severity').selectOption('CRITICAL');
    await page.getByTestId('input-title').fill(incidentTitle);
    await page
      .getByTestId('input-description')
      .fill(
        'Severe collision with fallen road debris. Front bumper damaged and radiator leak detected.',
      );
    await page.getByTestId('input-location').fill('I-80 Milepost 188 Eastbound');
    await page.getByTestId('input-operational-impact').selectOption('VEHICLE');
    await page.getByTestId('mode-trip').click();
    await page.getByTestId('input-trip-id').selectOption(firstTripId);

    await page.getByTestId('submit-incident-btn').click();

    // Verify Incident Details page
    await expect(page).toHaveURL(/\/incidents\/[0-9a-f-]+/u);
    const incidentId = page.url().split('/').pop()!;

    await expect(page.getByTestId('incident-display-id')).toBeVisible();
    await expect(page.getByTestId('status-badge')).toHaveText('REPORTED');
    await expect(page.getByTestId('severity-badge')).toHaveText('CRITICAL');
    await expect(page.getByTestId('impact-badge')).toContainText('Dispatch Impact: VEHICLE');
    await expect(page.getByTestId('incident-title')).toHaveText(incidentTitle);
    await expect(page.getByTestId('linked-trip')).toContainText('TRIP-');
    await expect(page.getByTestId('linked-vehicle')).toContainText(vehicleDisplayId);
    await expect(page.getByTestId('linked-driver')).toContainText(driverLastName);

    // 6. Prove IN_PROGRESS trip remains closable despite active blocking Incident
    await page.goto(`/trips/${firstTripId}`);
    await expect(page.getByTestId('trip-status')).toHaveText('IN_PROGRESS');

    // Complete the trip with post-trip inspection
    await expect(page.getByTestId('post-trip-gate-card')).toBeVisible();
    await page.getByTestId('start-post-trip-inspection-btn').click();
    await expect(page).toHaveURL(/\/inspections\/new/u);
    await page.getByTestId('submit-inspection-button').click();
    await expect(page).toHaveURL(/\/inspections\/[0-9a-f-]+/u);
    await page.getByTestId('start-inspection-button').click();
    await page.getByTestId('complete-inspection-button').click();
    await expect(page.getByTestId('inspection-status-badge')).toHaveText('COMPLETED');

    await page.goto(`/trips/${firstTripId}`);
    await expect(page.getByTestId('post-trip-gate-card')).toContainText(
      'Post-Trip Inspection Completed',
    );

    await page.getByTestId('complete-trip-btn').click();
    await expect(page.getByTestId('complete-modal')).toBeVisible();
    await page.getByTestId('end-odometer-input').fill('50180');
    await page
      .getByTestId('complete-notes-input')
      .fill('Trip safely concluded following incident report');
    await page.getByTestId('confirm-complete-btn').click();

    await expect(page.getByTestId('trip-status')).toHaveText('COMPLETED');

    // 7. Attempt subsequent trip dispatch on the affected vehicle -> verify BLOCKED by Incident gate
    await page.goto('/trips/new');
    await page.getByTestId('assignment-select').selectOption(assignmentId);
    await page.getByTestId('origin-input').fill('Central Supply Depot');
    await page.getByTestId('destination-input').fill('Outbound Yard');
    await page.getByTestId('purpose-input').fill('Attempted follow-on haul');
    await page.getByTestId('submit-trip-btn').click();

    await expect(page).toHaveURL(/\/trips\/[0-9a-f-]+/u);
    const secondTripId = page.url().split('/').pop()!;
    await expect(page.getByTestId('trip-status')).toHaveText('DRAFT');

    // Attempt DRAFT -> READY on vehicle blocked by active incident
    await page.getByTestId('mark-ready-btn').click();
    await expect(page.getByTestId('action-error-banner')).toBeVisible();
    await expect(page.getByTestId('action-error-banner')).toContainText(
      /blocked by (unresolved|active) incident|VEHICLE_BLOCKED_BY_INCIDENT/i,
    );
    // Status must remain DRAFT!
    await expect(page.getByTestId('trip-status')).toHaveText('DRAFT');

    // 8. Investigate, Add Note, Upload deterministic attachment, and verify Real Browser Download
    await page.goto(`/incidents/${incidentId}`);

    // Start Investigation
    await page.getByTestId('start-investigation-btn').click();
    await expect(page.getByTestId('status-badge')).toHaveText('INVESTIGATING');

    // Add Investigation Note
    const noteContent = `Initial on-scene forensic report filed by fleet investigator for ${timestamp}.`;
    await page.getByTestId('input-note-body').fill(noteContent);
    await page.getByTestId('add-note-btn').click();
    await expect(page.getByTestId('notes-section')).toContainText(noteContent);

    // Upload deterministic file fixture (PDF with exact known bytes)
    const deterministicBytes = Buffer.from(
      `%PDF-1.4\n%Deterministic Evidence Report ${timestamp}\n1 0 obj\n<< /Length 28 >>\nstream\nIncident Evidence Verified.\nendstream\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n`,
    );
    const deterministicSha256 = crypto
      .createHash('sha256')
      .update(deterministicBytes)
      .digest('hex');

    const tempDir = path.join(process.cwd(), 'tmp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    const fixtureFileName = `incident_evidence_${timestamp}.pdf`;
    const fixturePath = path.join(tempDir, fixtureFileName);
    fs.writeFileSync(fixturePath, deterministicBytes);

    try {
      await page.getByTestId('input-attachment-file').setInputFiles(fixturePath);
      await page.getByTestId('input-attachment-type').selectOption('DOCUMENT');
      await page.getByTestId('input-attachment-caption').fill('Deterministic Collision Report PDF');
      await page.getByTestId('upload-attachment-btn').click();

      await expect(page.getByTestId('detail-success')).toContainText(
        'Evidence attachment uploaded successfully',
      );
      await expect(page.getByTestId('attachments-section')).toContainText(fixtureFileName);
      await expect(page.getByTestId('attachments-section')).toContainText('DOCUMENT');
      await expect(page.getByTestId('attachments-section')).toContainText(
        deterministicSha256.slice(0, 16),
      );

      // Real Browser Download: click download button, capture download event, and verify exact byte equality
      const downloadButton = page
        .locator(`button[data-testid^="download-attachment-btn-"]`)
        .first();
      await expect(downloadButton).toBeVisible();

      const [download] = await Promise.all([page.waitForEvent('download'), downloadButton.click()]);

      const downloadPath = await download.path();
      expect(downloadPath).toBeTruthy();
      const downloadedBuffer = fs.readFileSync(downloadPath!);
      expect(deterministicBytes.length).toBeGreaterThan(0);
      expect(downloadedBuffer.length).toBe(deterministicBytes.length);
      expect(downloadedBuffer).toEqual(deterministicBytes);
      const downloadedSha256 = crypto.createHash('sha256').update(downloadedBuffer).digest('hex');
      expect(deterministicSha256).not.toBe(
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      );
      expect(downloadedSha256).toBe(deterministicSha256);

      // Security check: Verify raw storage key and MinIO credentials are NOT exposed in page DOM
      const pageHtml = await page.content();
      expect(pageHtml).not.toContain('local_vehicle_management_secret');
      expect(pageHtml).not.toContain('incident-attachments/');
    } finally {
      if (fs.existsSync(fixturePath)) {
        fs.unlinkSync(fixturePath);
      }
    }

    // 9. Resolve Incident with required non-empty resolution summary
    await page.getByTestId('resolve-incident-btn').click();
    await expect(page.getByTestId('resolve-modal')).toBeVisible();
    const resolutionSummary = `Vehicle structural repairs certified by certified collision center for ${timestamp}.`;
    await page.getByTestId('input-resolution-summary').fill(resolutionSummary);
    await page.getByTestId('confirm-resolve-btn').click();

    await expect(page.getByTestId('status-badge')).toHaveText('RESOLVED');
    await expect(page.getByTestId('resolution-banner')).toContainText(resolutionSummary);

    // 10. Verify subsequent Trip dispatch UNBLOCKS once Incident is RESOLVED!
    await page.goto(`/trips/${secondTripId}`);
    await expect(page.getByTestId('trip-status')).toHaveText('DRAFT');
    await page.getByTestId('mark-ready-btn').click();
    await expect(page.getByTestId('trip-status')).toHaveText('READY');

    // 11. Maintenance Escalation: create Maintenance Request from Incident
    await page.goto(`/incidents/${incidentId}`);
    await expect(page.getByTestId('create-mr-btn')).toBeVisible();
    await page.getByTestId('create-mr-btn').click();
    await expect(page.getByTestId('existing-mr-card')).toBeVisible();
    await expect(page.getByTestId('existing-mr-card')).toContainText('MR-');

    // Verify 1:1 escalation idempotency: button is replaced by card and no duplicate is creatable
    await expect(page.getByTestId('create-mr-btn')).not.toBeVisible();

    // 12. Close Incident to terminal state
    await page.getByTestId('close-incident-btn').click();
    await expect(page.getByTestId('status-badge')).toHaveText('CLOSED');

    // Terminal state verification: lifecycle mutation buttons are gone
    await expect(page.getByTestId('start-investigation-btn')).not.toBeVisible();
    await expect(page.getByTestId('resolve-incident-btn')).not.toBeVisible();
    await expect(page.getByTestId('close-incident-btn')).not.toBeVisible();
    await expect(page.getByTestId('cancel-incident-btn')).not.toBeVisible();

    // Verify Incident list reflects closed incident
    await page.goto('/incidents');
    await expect(page.getByTestId(`incident-link-${incidentId}`)).toBeVisible();
    await expect(page.getByTestId(`incident-status-${incidentId}`)).toHaveText('CLOSED');
  });

  test('supports cancellation lifecycle with mandatory cancellationReason', async ({ page }) => {
    test.setTimeout(60000);

    const timestamp = Date.now().toString().slice(-6);

    // Ensure dev session is authenticated
    await page.goto('/vehicles');
    await expect(page.getByRole('heading', { name: 'Vehicles', exact: true })).toBeVisible({
      timeout: 15000,
    });

    // Create a standalone vehicle first
    await page.goto('/vehicles/new');
    const vehicleDisplayId = `V-CAN-${timestamp}`;
    const safeTag = timestamp
      .toUpperCase()
      .replace(/[^A-HJ-NPR-Z0-9]/g, 'X')
      .slice(-6)
      .padStart(6, '0');
    await page.getByTestId('input-display-id').fill(vehicleDisplayId);
    await page.getByTestId('input-registration').fill(`CN-${timestamp.slice(-4)}`);
    await page.getByTestId('input-vin').fill(`1HGCR2F83MA${safeTag}`);
    await page.getByTestId('input-model').fill('Ford Transit');
    await page.getByTestId('select-type').selectOption('VAN');
    await page.getByTestId('select-fuel-type').selectOption('DIESEL');
    await page.getByTestId('input-year').fill('2024');
    await page.getByTestId('input-odometer').fill('30000');
    await page.getByTestId('submit-vehicle').click();
    await expect(page).toHaveURL(/\/vehicles\/[0-9a-f-]+/u);
    const vehicleId = page.url().split('/').pop()!;
    await page.getByTestId('activate-vehicle-btn').click();

    // Report incident
    await page.goto('/incidents/new');
    await page.getByTestId('input-type').selectOption('SAFETY');
    await page.getByTestId('input-severity').selectOption('LOW');
    await page.getByTestId('input-title').fill(`Accidental duplicate entry ${timestamp}`);
    await page
      .getByTestId('input-description')
      .fill('Logged in error by operator testing dispatch console.');
    await page.getByTestId('mode-standalone').click();
    await page.getByTestId('input-vehicle-id').selectOption(vehicleId);
    await page.getByTestId('submit-incident-btn').click();

    await expect(page).toHaveURL(/\/incidents\/[0-9a-f-]+/u);
    await expect(page.getByTestId('status-badge')).toHaveText('REPORTED');

    // Cancel report
    await page.getByTestId('cancel-incident-btn').click();
    await expect(page.getByTestId('cancel-modal')).toBeVisible();

    const cancelReason = 'Logged in error during dispatcher shift handover; verified false alarm.';
    await page.getByTestId('input-cancel-reason').fill(cancelReason);
    await page.getByTestId('confirm-cancel-btn').click();

    await expect(page.getByTestId('status-badge')).toHaveText('CANCELLED');
    await expect(page.getByTestId('cancellation-banner')).toContainText(cancelReason);
  });

  test('enforces RBAC: Viewer role can inspect incidents and download attachments, but cannot mutate, upload, or add notes', async ({
    page,
  }) => {
    test.setTimeout(60000);

    // Switch to Admin to report an incident with an attachment for Viewer testing
    await page.goto('/vehicles');
    await expect(page.getByRole('heading', { name: 'Vehicles', exact: true })).toBeVisible({
      timeout: 15000,
    });

    const timestamp = Date.now().toString().slice(-6);

    // Create a standalone vehicle
    await page.goto('/vehicles/new');
    const vehicleDisplayId = `V-VIEW-${timestamp}`;
    const safeTag = timestamp
      .toUpperCase()
      .replace(/[^A-HJ-NPR-Z0-9]/g, 'X')
      .slice(-6)
      .padStart(6, '0');
    await page.getByTestId('input-display-id').fill(vehicleDisplayId);
    await page.getByTestId('input-registration').fill(`VW-${timestamp.slice(-4)}`);
    await page.getByTestId('input-vin').fill(`1HGCR2F83MA${safeTag}`);
    await page.getByTestId('input-model').fill('Ram ProMaster');
    await page.getByTestId('select-type').selectOption('VAN');
    await page.getByTestId('select-fuel-type').selectOption('DIESEL');
    await page.getByTestId('input-year').fill('2024');
    await page.getByTestId('input-odometer').fill('20000');
    await page.getByTestId('submit-vehicle').click();
    await expect(page).toHaveURL(/\/vehicles\/[0-9a-f-]+/u);
    const vehicleId = page.url().split('/').pop()!;
    await page.getByTestId('activate-vehicle-btn').click();

    // Report incident as Admin
    await page.goto('/incidents/new');
    await page.getByTestId('input-type').selectOption('DAMAGE');
    await page.getByTestId('input-severity').selectOption('MEDIUM');
    await page.getByTestId('input-title').fill(`Side mirror glass shattered ${timestamp}`);
    await page
      .getByTestId('input-description')
      .fill('Passenger side mirror damaged by warehouse door.');
    await page.getByTestId('mode-standalone').click();
    await page.getByTestId('input-vehicle-id').selectOption(vehicleId);
    await page.getByTestId('submit-incident-btn').click();

    await expect(page).toHaveURL(/\/incidents\/[0-9a-f-]+/u);
    const incidentId = page.url().split('/').pop()!;

    // Upload an attachment as Admin
    const testBytes = Buffer.from(`%PDF-1.4\nViewer RBAC Test Evidence ${timestamp}\n%%EOF\n`);
    const tempDir = path.join(process.cwd(), 'tmp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    const tempFilePath = path.join(tempDir, `viewer_test_${timestamp}.pdf`);
    fs.writeFileSync(tempFilePath, testBytes);

    try {
      await page.getByTestId('input-attachment-file').setInputFiles(tempFilePath);
      await page.getByTestId('input-attachment-type').selectOption('DOCUMENT');
      await page.getByTestId('input-attachment-caption').fill('Viewer Evidence PDF');
      await page.getByTestId('upload-attachment-btn').click();
      await expect(page.getByTestId('attachments-section')).toContainText(
        `viewer_test_${timestamp}.pdf`,
      );
    } finally {
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
    }

    // Now switch to Viewer role
    await page.goto('/vehicles');
    await page.getByTestId('auth-viewer-btn').click();
    await expect(page.getByTestId('user-badge')).toContainText('Viewer', { timeout: 15000 });

    // Verify incidents list is readable, but "Report Incident" button is hidden
    await page.goto('/incidents');
    await expect(page.getByTestId('incidents-title')).toBeVisible();
    await expect(page.getByTestId('report-incident-btn')).not.toBeVisible();

    // Navigate to incident detail page
    await page.goto(`/incidents/${incidentId}`);
    await expect(page.getByTestId('incident-display-id')).toBeVisible();
    await expect(page.getByTestId('status-badge')).toHaveText('REPORTED');

    // Lifecycle mutations must NOT be visible to Viewer
    await expect(page.getByTestId('start-investigation-btn')).not.toBeVisible();
    await expect(page.getByTestId('resolve-incident-btn')).not.toBeVisible();
    await expect(page.getByTestId('close-incident-btn')).not.toBeVisible();
    await expect(page.getByTestId('cancel-incident-btn')).not.toBeVisible();
    await expect(page.getByTestId('create-mr-btn')).not.toBeVisible();

    // Note addition form must NOT be visible to Viewer
    await expect(page.getByTestId('input-note-body')).not.toBeVisible();
    await expect(page.getByTestId('add-note-btn')).not.toBeVisible();

    // Upload attachment form must NOT be visible to Viewer
    await expect(page.getByTestId('input-attachment-file')).not.toBeVisible();
    await expect(page.getByTestId('upload-attachment-btn')).not.toBeVisible();

    // Download button MUST be visible and functional for Viewer (incident.attachment.download granted)
    const downloadBtn = page.locator(`button[data-testid^="download-attachment-btn-"]`).first();
    await expect(downloadBtn).toBeVisible();

    const [download] = await Promise.all([page.waitForEvent('download'), downloadBtn.click()]);

    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();
    const downloadedBuffer = fs.readFileSync(downloadPath!);
    expect(downloadedBuffer).toEqual(testBytes);

    // Switch back to Admin at end of test to leave clean session
    await page.goto('/vehicles');
    await page.getByTestId('auth-admin-btn').click();
    await expect(page.getByTestId('user-badge')).toContainText('Admin', { timeout: 15000 });
  });
});
