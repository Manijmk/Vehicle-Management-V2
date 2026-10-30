import { expect, test } from '@playwright/test';

const DEV_ADMIN_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzaWQiOiJsb2NhbC0yMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDEiLCJzdWIiOiIyMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDEiLCJpc3MiOiJ2ZWhpY2xlLW1hbmFnZW1lbnQtbG9jYWwiLCJhdWQiOiJ2ZWhpY2xlLW1hbmFnZW1lbnQtYXBpIiwiaWF0IjoxNzkwMTQ3NjA5LCJleHAiOjE4MjE2ODM2MDl9.tHEKxYCMGub44l1Wi47dGZCZw4wCNUfKhyxXHz95z-c';
const DEV_ORG_ID = '10000000-0000-4000-8000-000000000001';

test.describe('Milestone 8: Compliance and Documents Vertical Slice Acceptance Flow', () => {
  let createdVehicleId = '';
  let createdDocId = '';

  test.beforeEach(async ({ request }) => {
    // Ensure pristine tenant policy: archive any lingering test document types from previous runs
    const res = await request.get('http://localhost:3001/api/v1/compliance/document-types', {
      headers: {
        Authorization: `Bearer ${DEV_ADMIN_TOKEN}`,
        'x-organization-id': DEV_ORG_ID,
      },
    });
    if (res.ok()) {
      const data = (await res.json()) as { items?: { id: string; code: string; status: string }[] };
      const types = data.items ?? [];
      for (const t of types) {
        if (t.code.startsWith('CMP_') && t.status === 'ACTIVE') {
          await request.post(
            `http://localhost:3001/api/v1/compliance/document-types/${t.id}/archive`,
            {
              headers: {
                Authorization: `Bearer ${DEV_ADMIN_TOKEN}`,
                'x-organization-id': DEV_ORG_ID,
              },
            },
          );
        }
      }
    }
  });

  test('exercises complete Compliance Lifecycle: policy configuration, operational dispatch gating, MinIO S3 upload & verification, trip unblocking, document replacement, and revocation', async ({
    page,
  }) => {
    test.setTimeout(60000);

    const timestamp = Date.now().toString().slice(-6);
    const vehicleDisplayId = `V-CMP-${timestamp}`;
    const vehicleReg = `CP-${timestamp.slice(-4)}TX`;
    const safeTag = timestamp
      .toUpperCase()
      .replace(/[^A-HJ-NPR-Z0-9]/g, 'X')
      .slice(-6)
      .padStart(6, '0');
    const vehicleVin = `1HGCR2F83MA${safeTag}`;

    const driverFirstName = 'Sam';
    const driverLastName = `Compliance-${timestamp}`;
    const employeeNumber = `EMP-${timestamp}`;
    const licenseNumber = `DL-${timestamp}`;

    // 1. Create and activate Vehicle
    await page.goto('/vehicles/new');
    await expect(page).toHaveTitle(/Vehicle Management System/u);
    await page.getByTestId('input-display-id').fill(vehicleDisplayId);
    await page.getByTestId('input-registration').fill(vehicleReg);
    await page.getByTestId('input-vin').fill(vehicleVin);
    await page.getByTestId('input-model').fill('Playwright Compliance Fleet');
    await page.getByTestId('select-type').selectOption('TRUCK');
    await page.getByTestId('select-fuel-type').selectOption('DIESEL');
    await page.getByTestId('input-year').fill('2025');
    await page.getByTestId('input-odometer').fill('10000');
    await page.getByTestId('submit-vehicle').click();

    await expect(page).toHaveURL(/\/vehicles\/[0-9a-f-]+/u);
    const vehicleId = page.url().split('/').pop()!;
    createdVehicleId = vehicleId;
    await page.getByTestId('activate-vehicle-btn').click();
    await expect(page.getByTestId('detail-status')).toHaveText('ACTIVE');

    // 2. Create and activate Driver with valid license
    await page.goto('/drivers/new');
    await page.getByTestId('first-name-input').fill(driverFirstName);
    await page.getByTestId('last-name-input').fill(driverLastName);
    await page.getByTestId('employee-number-input').fill(employeeNumber);
    await page.getByTestId('email-input').fill(`sam.cmp.${timestamp}@example.test`);
    await page.getByTestId('phone-input').fill('+1-555-0188');
    await page.getByTestId('submit-driver-button').click();

    await expect(page).toHaveURL(/\/drivers\/[0-9a-f-]+/u);
    const driverId = page.url().split('/').pop()!;

    // Add driver license
    await page.getByTestId('add-license-button').click();
    await expect(page.getByTestId('add-license-form')).toBeVisible();
    await page.getByTestId('license-number-input').fill(licenseNumber);
    await page.getByTestId('license-country-input').fill('US');
    await page.getByTestId('license-region-input').fill('TX');
    await page.getByTestId('license-classes-input').fill('B, C1');
    await page.getByTestId('license-issue-date-input').fill('2024-01-01');
    await page.getByTestId('license-expiry-date-input').fill('2028-01-01');
    await page.getByTestId('save-license-button').click();
    await expect(page.getByTestId('licenses-table')).toContainText(licenseNumber);

    // Activate driver
    await page.getByTestId('activate-driver-button').click();
    await expect(page.getByTestId('driver-status-badge-active')).toBeVisible();

    // 3. Create Vehicle-Driver Assignment
    await page.goto('/assignments/new');
    await page.getByTestId('vehicle-select').selectOption(vehicleId);
    await page.getByTestId('driver-select').selectOption(driverId);
    await page.getByTestId('notes-input').fill('Milestone 8 Compliance Acceptance Assignment');
    await page.getByTestId('submit-assignment-button').click();

    await expect(page).toHaveURL(/\/assignments\/[0-9a-f-]+/u);
    const assignmentId = page.url().split('/').pop()!;
    await expect(page.getByTestId('assignment-status-badge-active')).toBeVisible();

    // 4. Create DRAFT Trip
    await page.goto('/trips/new');
    await page.getByTestId('assignment-select').selectOption(assignmentId);
    await page.getByTestId('origin-input').fill('Central Depot Dallas');
    await page.getByTestId('destination-input').fill('Austin Distribution Hub');
    await page.getByTestId('submit-trip-btn').click();

    await expect(page).toHaveURL(/\/trips\/[0-9a-f-]+/u);
    const tripId = page.url().split('/').pop()!;
    await expect(page.getByTestId('trip-status')).toHaveText('DRAFT');

    // 5. Create a blocking compliance document type for VEHICLE
    const docTypeCode = `CMP_REG_${timestamp}`;
    const docTypeName = `Heavy Truck DOT Permit ${timestamp}`;

    await page.goto('/compliance/document-types/new');
    await page.getByTestId('input-doc-type-code').fill(docTypeCode);
    await page.getByTestId('select-subject-type').selectOption('VEHICLE');
    await page.getByTestId('input-doc-type-name').fill(docTypeName);
    await page.getByTestId('input-doc-type-description').fill('Mandatory federal safety permit');

    // Ensure required and blocks operation are checked
    const reqCheckbox = page.getByTestId('checkbox-required');
    if (!(await reqCheckbox.isChecked())) {
      await reqCheckbox.check();
    }
    const blocksCheckbox = page.getByTestId('checkbox-blocks-operation');
    if (!(await blocksCheckbox.isChecked())) {
      await blocksCheckbox.check();
    }
    await page.getByTestId('btn-submit-doc-type').click();

    await expect(page).toHaveURL(/\/compliance\/document-types/u);
    await expect(page.getByTestId('doc-types-table')).toContainText(docTypeCode);

    // 6. Verify Trip is now operationally blocked by compliance
    await page.goto(`/trips/${tripId}`);
    await expect(page.getByTestId('trip-compliance-warning-banner')).toBeVisible();
    await expect(page.getByTestId('trip-compliance-warning-banner')).toContainText(
      'Trip Blocked by Compliance Gating',
    );
    await expect(page.getByTestId('trip-compliance-warning-banner')).toContainText(docTypeName);

    // Attempting to Mark Ready must fail
    await page.getByTestId('mark-ready-btn').click();
    await expect(page.getByTestId('action-error-banner')).toBeVisible();
    await expect(page.getByTestId('trip-status')).toHaveText('DRAFT');

    // 7. Verify Vehicle Page shows operational blocking
    await page.goto(`/vehicles/${vehicleId}`);
    await expect(page.getByTestId('vehicle-compliance-blocked-banner')).toBeVisible();
    await expect(page.getByTestId('vehicle-compliance-requirements-table')).toContainText(
      docTypeCode,
    );
    await expect(page.getByTestId('vehicle-compliance-requirements-table')).toContainText(
      'MISSING',
    );

    // 8. Upload Compliance Document for Vehicle with real PDF payload
    await page.getByTestId('btn-upload-vehicle-doc').click();
    await page
      .getByTestId('select-doc-type')
      .selectOption({ label: `${docTypeName} (${docTypeCode})` });

    await page.getByTestId('input-doc-file').setInputFiles({
      name: `permit-${timestamp}.pdf`,
      mimeType: 'application/pdf',
      buffer: Buffer.from(
        '%PDF-1.4 1 0 obj <</Type /Catalog /Pages 2 0 R>> endobj xref 0 1 trailer <</Root 1 0 R>> %%EOF',
      ),
    });

    await page.getByTestId('input-doc-number').fill(`DOT-TX-${timestamp}`);
    await page.getByTestId('input-doc-issued-on').fill('2026-01-15');
    await page.getByTestId('input-doc-expires-on').fill('2027-01-15');
    await page.getByTestId('btn-submit-upload-doc').click();

    // Verify modal closes and vehicle is now unblocked
    await expect(page.getByTestId('vehicle-unblocked-badge')).toBeVisible();
    await expect(page.getByTestId('vehicle-compliance-blocked-banner')).not.toBeVisible();
    await expect(page.getByTestId('vehicle-compliance-requirements-table')).toContainText('VALID');

    // Check document in vehicle documents list
    const docItem = page.locator('li[data-testid^="vehicle-doc-item-"]').first();
    await expect(docItem).toBeVisible();

    const docLink = docItem.locator('a[href^="/compliance/documents/"]').first();
    const docUrl = await docLink.getAttribute('href');
    const docId = docUrl!.split('/').pop()!;
    createdDocId = docId;

    // 9. Return to Trip page and verify trip is now unblocked and can transition to READY
    await page.goto(`/trips/${tripId}`);
    await expect(page.getByTestId('trip-compliance-warning-banner')).not.toBeVisible();

    await page.getByTestId('mark-ready-btn').click();
    await expect(page.getByTestId('trip-status')).toHaveText('READY');

    // 10. Document Details, Download verification, and Document Replacement
    await page.goto(`/compliance/documents/${docId}`);
    await expect(page.getByTestId('doc-status-badge')).toHaveText('ACTIVE');
    await expect(page.getByTestId('btn-download-file')).toBeVisible();

    // Test Document Replacement
    await page.getByTestId('btn-open-replace-modal').click();
    await page.getByTestId('input-replace-file').setInputFiles({
      name: `permit-renewed-${timestamp}.pdf`,
      mimeType: 'application/pdf',
      buffer: Buffer.from(
        '%PDF-1.4 1 0 obj <</Type /Catalog /Pages 2 0 R>> endobj replacement pdf stream %%EOF',
      ),
    });
    await page.getByTestId('input-replace-doc-number').fill(`DOT-TX-${timestamp}-R1`);
    await page.getByTestId('input-replace-issued-on').fill('2026-02-01');
    await page.getByTestId('input-replace-expires-on').fill('2028-02-01');
    await page.getByTestId('btn-submit-replace').click();

    // Redirects to replacement document details page
    await page.waitForURL((url) => !url.pathname.endsWith(docId));
    const newDocId = page.url().split('/').pop()!;
    expect(newDocId).not.toBe(docId);
    await expect(page.getByTestId('doc-status-badge')).toHaveText('ACTIVE');

    // Verify old document is superseded
    await page.goto(`/compliance/documents/${docId}`);
    await expect(page.getByTestId('doc-status-badge')).toHaveText('SUPERSEDED');
    await expect(page.getByTestId('superseded-banner')).toBeVisible();

    // 11. Test Document Revocation
    await page.goto(`/compliance/documents/${newDocId}`);
    await page.getByTestId('btn-open-revoke-modal').click();
    await page
      .getByTestId('input-revoke-reason')
      .fill('Regulatory audit identified invalid endorsement stamp');
    await page.getByTestId('btn-submit-revoke').click();

    await expect(page.getByTestId('doc-status-badge')).toHaveText('REVOKED');
    await expect(page.getByTestId('revocation-banner')).toBeVisible();
    await expect(page.getByTestId('revocation-banner')).toContainText(
      'Regulatory audit identified invalid endorsement stamp',
    );

    // Verify vehicle is blocked once again due to revoked document leaving requirement unsatisfied
    await page.goto(`/vehicles/${vehicleId}`);
    await expect(page.getByTestId('vehicle-compliance-blocked-banner')).toBeVisible();
    await expect(page.getByTestId('vehicle-compliance-requirements-table')).toContainText(
      'MISSING',
    );

    // 12. Clean up policy: Archive document type so subsequent test runs remain clean
    await page.goto('/compliance/document-types');
    page.once('dialog', (dialog) => void dialog.accept());
    const archiveBtn = page.getByTestId(`btn-archive-${docTypeCode}`);
    await expect(archiveBtn).toBeVisible();
    await archiveBtn.click();
    await expect(page.getByTestId(`doc-type-status-${docTypeCode}`)).toHaveText('ARCHIVED');
  });

  test('enforces RBAC permissions: Dev Viewer has read-only access and cannot configure policies, upload, replace, or revoke', async ({
    page,
  }) => {
    // 1. Switch to Dev Viewer
    await page.goto('/compliance');
    const switchViewerBtn = page.getByTestId('auth-viewer-btn');
    await expect(switchViewerBtn).toBeVisible();
    await switchViewerBtn.click();
    await expect(page.getByTestId('user-badge')).toContainText('Development Viewer');

    // 2. Compliance Dashboard is accessible in read-only mode
    await expect(page.getByTestId('compliance-summary-cards')).toBeVisible();

    // 3. Document Types Catalog: "+ New Document Type" button must be hidden
    await page.goto('/compliance/document-types');
    await expect(page.getByTestId('btn-create-doc-type')).not.toBeVisible();

    // 4. Vehicles page: "+ Upload Compliance Document" button must be hidden
    if (createdVehicleId) {
      await page.goto(`/vehicles/${createdVehicleId}`);
      await expect(page.getByTestId('btn-upload-vehicle-doc')).not.toBeVisible();
    } else {
      await page.goto('/vehicles');
      await expect(page.getByTestId('create-vehicle-link')).not.toBeVisible();
    }

    // 5. Documents page: Replace, Revoke, and Download buttons must be hidden for viewer (requires compliance.document.manage and compliance.document.download)
    if (createdDocId) {
      await page.goto(`/compliance/documents/${createdDocId}`);
      await expect(page.getByTestId('doc-status-badge')).toBeVisible();
      await expect(page.getByTestId('btn-open-replace-modal')).not.toBeVisible();
      await expect(page.getByTestId('btn-open-revoke-modal')).not.toBeVisible();
      await expect(page.getByTestId('btn-download-file')).not.toBeVisible();
    } else {
      await page.goto('/compliance/documents');
      await expect(page.getByTestId('all-docs-title')).toBeVisible();
    }

    // 6. Restore Admin session
    await page.getByTestId('auth-admin-btn').click();
    await expect(page.getByTestId('user-badge')).toContainText('Development Admin');
  });
});
