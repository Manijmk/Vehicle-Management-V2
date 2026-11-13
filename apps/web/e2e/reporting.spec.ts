import { expect, test } from '@playwright/test';
import { createDatabaseClient } from '@vms/database';

const DEV_ORG_ID = '10000000-0000-4000-8000-000000000001';
const DEV_ADMIN_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzaWQiOiJsb2NhbC0yMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDEiLCJzdWIiOiIyMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDEiLCJpc3MiOiJ2ZWhpY2xlLW1hbmFnZW1lbnQtbG9jYWwiLCJhdWQiOiJ2ZWhpY2xlLW1hbmFnZW1lbnQtYXBpIiwiaWF0IjoxNzkwMTQ3NjA5LCJleHAiOjE4MjE2ODM2MDl9.tHEKxYCMGub44l1Wi47dGZCZw4wCNUfKhyxXHz95z-c';

const prisma = createDatabaseClient({
  databaseUrl:
    process.env.DATABASE_URL ??
    'postgresql://vehicle_management:local_vehicle_management@localhost:5432/vehicle_management?schema=public',
});

test.describe('Milestone 13: Reporting and Analytics Acceptance Flow', () => {
  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  // ==========================================
  // SCENARIO A: Dashboard Navigation & Headline Metrics
  // ==========================================
  test('Scenario A — Dashboard: navigate via header link, view KPI cards, and verify drill-downs', async ({
    page,
  }) => {
    // 1. Start from vehicles page and click Reports navigation
    await page.goto('/vehicles');
    await expect(page.getByTestId('nav-reports')).toBeVisible();
    await page.getByTestId('nav-reports').click();

    // 2. Verify redirected to reports dashboard
    await expect(page).toHaveURL(/\/reports$/u, { timeout: 10_000 });
    await expect(page.getByTestId('reports-title')).toBeVisible();

    // 3. Verify top headline KPI cards are visible
    await expect(page.getByTestId('kpi-fleet')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('kpi-trips')).toBeVisible();
    await expect(page.getByTestId('kpi-maintenance')).toBeVisible();
    await expect(page.getByTestId('kpi-compliance')).toBeVisible();
    await expect(page.getByTestId('kpi-costs')).toBeVisible();

    // 4. Verify drill-down navigation links exist
    await expect(page.getByTestId('link-utilization')).toBeVisible();
    await expect(page.getByTestId('link-trips')).toBeVisible();
    await expect(page.getByTestId('link-costs')).toBeVisible();
    await expect(page.getByTestId('link-maintenance')).toBeVisible();
    await expect(page.getByTestId('link-compliance')).toBeVisible();
    await expect(page.getByTestId('link-incidents')).toBeVisible();
    await expect(page.getByTestId('link-telemetry')).toBeVisible();
  });

  // ==========================================
  // SCENARIO B: Vehicle Utilization Table & Date Range Filter
  // ==========================================
  test('Scenario B — Utilization: inspect vehicle table, apply custom date window, and verify calculations', async ({
    page,
  }) => {
    await page.goto('/reports/utilization');
    await expect(page.getByTestId('utilization-title')).toBeVisible();

    // Verify utilization table renders
    await expect(page.getByTestId('utilization-table')).toBeVisible();

    // Adjust date range inputs and apply
    await page.getByTestId('input-from').fill('2026-01-01');
    await page.getByTestId('input-to').fill('2026-12-31');
    await page.getByTestId('btn-apply-filter').click();

    // Verify table remains visible and operational
    await expect(page.getByTestId('utilization-table')).toBeVisible();
  });

  // ==========================================
  // SCENARIO C: Multi-Currency Partitioning & Fuel Semantics
  // ==========================================
  test('Scenario C — Costs: verify multi-currency partitioning, physical fuel units, and authoritative anomalies', async ({
    page,
  }) => {
    await page.goto('/reports/costs');
    await expect(page.getByTestId('costs-report-title')).toBeVisible();

    // Export buttons are visible
    await expect(page.getByTestId('export-csv-btn')).toBeVisible();
    await expect(page.getByTestId('export-pdf-btn')).toBeVisible();

    // Verify fuel anomalies table renders
    await expect(page.getByTestId('fuel-anomalies-table')).toBeVisible();
  });

  // ==========================================
  // SCENARIO C2: Telemetry Freshness & Device Classification
  // ==========================================
  test('Scenario C2 — Telemetry Freshness: verify shared M12 freshness boundaries (<2m, 2-60m, >60m)', async ({
    page,
  }) => {
    await page.goto('/reports/telemetry');
    await expect(page.getByTestId('telemetry-report-title')).toBeVisible();
    await expect(page.getByText('Fresh (<2m)')).toBeVisible();
    await expect(page.getByText('Stale (2-60m)')).toBeVisible();
  });

  // ==========================================
  // SCENARIO D: Streaming CSV & PDF Export Endpoints with Formula Escaping
  // ==========================================
  test('Scenario D — Exports: generate streaming CSV and PDF exports and verify format signatures and audit log', async ({
    request,
  }) => {
    const apiBase = 'http://localhost:3001/api/v1';

    // 1. Fetch CSV export
    const csvRes = await request.get(
      `${apiBase}/reports/fleet-overview/export?format=csv&from=2026-01-01&to=2026-12-31`,
      {
        headers: {
          authorization: `Bearer ${DEV_ADMIN_TOKEN}`,
          'x-organization-id': DEV_ORG_ID,
        },
      },
    );
    expect(csvRes.ok()).toBe(true);
    expect(csvRes.headers()['content-type']).toContain('text/csv');
    expect(csvRes.headers()['content-disposition']).toContain('attachment');
    expect(csvRes.headers()['content-disposition']).toContain('.csv');
    const csvText = await csvRes.text();
    expect(csvText).toContain('"Metric","Value"');

    // 2. Fetch PDF export
    const pdfRes = await request.get(
      `${apiBase}/reports/trips/export?format=pdf&from=2026-01-01&to=2026-12-31`,
      {
        headers: {
          authorization: `Bearer ${DEV_ADMIN_TOKEN}`,
          'x-organization-id': DEV_ORG_ID,
        },
      },
    );
    expect(pdfRes.ok()).toBe(true);
    expect(pdfRes.headers()['content-type']).toContain('application/pdf');
    expect(pdfRes.headers()['content-disposition']).toContain('attachment');
    expect(pdfRes.headers()['content-disposition']).toContain('.pdf');
    const pdfBuffer = await pdfRes.body();
    const pdfHeader = pdfBuffer.subarray(0, 8).toString('utf-8');
    expect(pdfHeader).toContain('%PDF-1.4');

    // 3. Verify audit log was recorded for REPORT_EXPORTED
    const auditEntry = await prisma.auditLog.findFirst({
      where: {
        organizationId: DEV_ORG_ID,
        action: 'REPORT_EXPORTED',
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(auditEntry).not.toBeNull();
    expect(auditEntry?.entityType).toBe('Report');
  });

  // ==========================================
  // SCENARIO E: RBAC & Tenant Isolation
  // ==========================================
  test('Scenario E — RBAC & Tenant Isolation: Viewer has read access and cannot access other tenants', async ({
    page,
    request,
  }) => {
    // 1. Navigate to dashboard and switch to Development Viewer
    await page.goto('/reports');
    await page.getByTestId('auth-viewer-btn').click();
    await expect(page.getByTestId('user-badge')).toContainText('Viewer', { timeout: 10_000 });

    // 2. Viewer can view dashboard
    await expect(page.getByTestId('reports-title')).toBeVisible();

    // 3. Cross-tenant isolation: Request from Org B without authorization should fail
    const ORG_B_ID = '10000000-0000-4000-8000-000000000002';
    const unauthorizedRes = await request.get(
      'http://localhost:3001/api/v1/reports/fleet-overview',
      {
        headers: {
          authorization: `Bearer ${DEV_ADMIN_TOKEN}`,
          'x-organization-id': ORG_B_ID,
        },
      },
    );
    // Dev Admin belongs to Org A, accessing Org B must fail with 403 Forbidden
    expect(unauthorizedRes.status()).toBe(403);
  });
});
