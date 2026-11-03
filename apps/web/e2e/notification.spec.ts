import { expect, test } from '@playwright/test';
import { createDatabaseClient } from '@vms/database';

const DEV_ORG_ID = '10000000-0000-4000-8000-000000000001';
const DEV_ADMIN_USER_ID = '20000000-0000-4000-8000-000000000001';

const prisma = createDatabaseClient({
  databaseUrl:
    process.env.DATABASE_URL ??
    'postgresql://vehicle_management:local_vehicle_management@localhost:5432/vehicle_management?schema=public',
});

test.describe('Milestone 11: Notifications and Automation Acceptance Flow', () => {
  const timestamp = Date.now().toString().slice(-6);

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test('exercises complete notification lifecycle: feed display, priorities, deep links, mark-as-read, unread filter, preferences with mandatory in-app safety lock, and template management', async ({
    page,
  }) => {
    test.setTimeout(90000);

    // 1. Seed fresh test notifications directly in database for DEV_ADMIN_USER_ID
    const testDisplayId1 = `NTF-${timestamp}-01`;
    const testDisplayId2 = `NTF-${timestamp}-02`;
    const testDisplayId3 = `NTF-${timestamp}-03`;

    // Notification 1: CRITICAL inspection failure
    await prisma.notification.create({
      data: {
        organizationId: DEV_ORG_ID,
        displayId: testDisplayId1,
        type: 'INSPECTION_CRITICAL_FAILURE',
        category: 'CRITICAL_INSPECTION',
        priority: 'CRITICAL',
        title: `Pre-Trip Inspection Failure [${timestamp}]`,
        body: 'Vehicle failed pre-trip safety inspection with critical brake defect. Ground vehicle immediately.',
        sourceAggregateType: 'Inspection',
        sourceAggregateId: '10000000-0000-4000-8000-000000000099',
        recipients: {
          create: [
            {
              userId: DEV_ADMIN_USER_ID,
              channels: ['IN_APP'],
              inAppRead: false,
            },
          ],
        },
      },
    });

    // Notification 2: HIGH incident alert
    await prisma.notification.create({
      data: {
        organizationId: DEV_ORG_ID,
        displayId: testDisplayId2,
        type: 'INCIDENT_CRITICAL_REPORTED',
        category: 'INCIDENT',
        priority: 'HIGH',
        title: `Major Incident Reported [${timestamp}]`,
        body: 'Vehicle involved in high-severity incident. Operational dispatch gate engaged.',
        sourceAggregateType: 'Incident',
        sourceAggregateId: '10000000-0000-4000-8000-000000000098',
        recipients: {
          create: [
            {
              userId: DEV_ADMIN_USER_ID,
              channels: ['IN_APP'],
              inAppRead: false,
            },
          ],
        },
      },
    });

    // Notification 3: NORMAL maintenance work order
    await prisma.notification.create({
      data: {
        organizationId: DEV_ORG_ID,
        displayId: testDisplayId3,
        type: 'MAINTENANCE_WORK_ORDER_CREATED',
        category: 'MAINTENANCE',
        priority: 'NORMAL',
        title: `Work Order Assigned [${timestamp}]`,
        body: 'Technician assigned to work order WO-9021. Preventive maintenance scheduled.',
        sourceAggregateType: 'MaintenanceWorkOrder',
        sourceAggregateId: '10000000-0000-4000-8000-000000000097',
        recipients: {
          create: [
            {
              userId: DEV_ADMIN_USER_ID,
              channels: ['IN_APP'],
              inAppRead: false,
            },
          ],
        },
      },
    });

    // 2. Open vehicles page to ensure tenant dev session is initialized
    await page.goto('/vehicles');
    await expect(page.getByRole('heading', { name: 'Vehicles', exact: true })).toBeVisible({
      timeout: 15000,
    });

    // Verify Navigation elements in TenantHeader
    await expect(page.getByTestId('nav-notifications')).toBeVisible();
    await expect(page.getByTestId('notification-bell')).toBeVisible();
    // Notification badge should be visible and have count >= 3
    const badge = page.getByTestId('notification-badge');
    await expect(badge).toBeVisible();

    // 3. Navigate to Notifications Feed via Navigation link
    await page.getByTestId('nav-notifications').click();
    await expect(page).toHaveURL(/\/notifications/u);
    await expect(
      page.getByRole('heading', { name: 'In-App Notification Center', exact: true }),
    ).toBeVisible();

    // Verify toolbar indicators
    await expect(page.getByTestId('unread-count-indicator')).toBeVisible();
    await expect(page.getByTestId('mark-all-read-btn')).toBeVisible();

    // 4. Verify rendered notifications, priority styling, and content
    const criticalCard = page.locator(
      `[data-testid="notification-item"]:has-text("${testDisplayId1}")`,
    );
    await expect(criticalCard).toBeVisible();
    await expect(criticalCard.getByText('CRITICAL', { exact: true })).toBeVisible();
    await expect(criticalCard.getByText('CRITICAL_INSPECTION', { exact: true })).toBeVisible();
    await expect(
      criticalCard.getByText(`Pre-Trip Inspection Failure [${timestamp}]`),
    ).toBeVisible();
    await expect(criticalCard.getByTestId('read-status')).toHaveText('Unread');

    const highCard = page.locator(
      `[data-testid="notification-item"]:has-text("${testDisplayId2}")`,
    );
    await expect(highCard).toBeVisible();
    await expect(highCard.getByText('HIGH', { exact: true })).toBeVisible();
    await expect(highCard.getByText('INCIDENT', { exact: true })).toBeVisible();
    await expect(highCard.getByText(`Major Incident Reported [${timestamp}]`)).toBeVisible();

    const normalCard = page.locator(
      `[data-testid="notification-item"]:has-text("${testDisplayId3}")`,
    );
    await expect(normalCard).toBeVisible();
    await expect(normalCard.getByText('NORMAL', { exact: true })).toBeVisible();
    await expect(normalCard.getByText('MAINTENANCE', { exact: true })).toBeVisible();

    // 5. Verify source entity deep links
    const deepLink = highCard.getByTestId('source-entity-link');
    await expect(deepLink).toHaveText('View Incident →');
    await deepLink.click();
    await expect(page).toHaveURL(/\/incidents/u);

    // Return to notifications feed
    await page.goto('/notifications');
    await expect(
      page.getByRole('heading', { name: 'In-App Notification Center', exact: true }),
    ).toBeVisible();

    // 6. Mark single notification as read
    const targetCard = page.locator(
      `[data-testid="notification-item"]:has-text("${testDisplayId1}")`,
    );
    const markReadBtn = targetCard.getByTestId('mark-read-btn');
    await expect(markReadBtn).toBeVisible();
    await markReadBtn.click();

    // Verify status changed to Read and button disappeared
    await expect(targetCard.getByTestId('read-status')).toHaveText('Read');
    await expect(targetCard.getByTestId('mark-read-btn')).toHaveCount(0);

    // 7. Test "Show Unread Only" filter toggle
    const unreadToggle = page.getByTestId('unread-filter-toggle');
    await unreadToggle.check();

    // Read card should now be hidden
    await expect(
      page.locator(`[data-testid="notification-item"]:has-text("${testDisplayId1}")`),
    ).toHaveCount(0);
    // Unread cards should remain visible
    await expect(
      page.locator(`[data-testid="notification-item"]:has-text("${testDisplayId2}")`),
    ).toBeVisible();
    await expect(
      page.locator(`[data-testid="notification-item"]:has-text("${testDisplayId3}")`),
    ).toBeVisible();

    // Uncheck filter
    await unreadToggle.uncheck();
    await expect(
      page.locator(`[data-testid="notification-item"]:has-text("${testDisplayId1}")`),
    ).toBeVisible();

    // 8. Test "Mark all as read"
    const markAllBtn = page.getByTestId('mark-all-read-btn');
    await markAllBtn.click();

    // Verify all cards are marked as Read
    await expect(page.getByTestId('unread-count-indicator')).toHaveText('0 Unread Notifications');
    await expect(page.getByTestId('mark-all-read-btn')).toHaveCount(0);
    await expect(page.getByTestId('notification-badge')).toHaveCount(0);

    // 9. Navigate to Notification Preferences
    await page.getByTestId('nav-preferences').click();
    await expect(page).toHaveURL(/\/notifications\/preferences/u);
    await expect(
      page.getByRole('heading', { name: 'Notification Channel Preferences', exact: true }),
    ).toBeVisible();

    // Verify mandatory in-app safety lock
    // For CRITICAL_INSPECTION and INCIDENT, In-App toggle is disabled
    const critInApp = page.getByTestId('pref-inapp-CRITICAL_INSPECTION');
    await expect(critInApp).toBeDisabled();
    const incInApp = page.getByTestId('pref-inapp-INCIDENT');
    await expect(incInApp).toBeDisabled();

    // For MAINTENANCE, In-App toggle is enabled (not disabled)
    const maintInApp = page.getByTestId('pref-inapp-MAINTENANCE');
    await expect(maintInApp).toBeEnabled();

    // Toggle Email preference for MAINTENANCE
    const maintEmail = page.getByTestId('pref-email-MAINTENANCE');
    const wasChecked = await maintEmail.isChecked();
    await maintEmail.click();

    // Verify feedback message
    await expect(page.getByTestId('pref-feedback')).toBeVisible();
    await expect(page.getByTestId('pref-feedback')).toContainText(
      'Preferences for Maintenance & Work Orders saved successfully.',
    );

    // Reload page to verify persistence
    await page.reload();
    await expect(page.getByTestId('pref-email-MAINTENANCE')).toBeChecked({ checked: !wasChecked });

    // 10. Navigate to Notification Templates
    await page.getByTestId('back-to-notifications-link').click();
    await expect(page).toHaveURL(/\/notifications/u);
    await page.getByTestId('nav-templates').click();
    await expect(page).toHaveURL(/\/notifications\/templates/u);
    await expect(
      page.getByRole('heading', { name: 'Notification Templates', exact: true }),
    ).toBeVisible();

    // Verify canonical templates are rendered
    await expect(page.getByTestId('template-item-INSPECTION_CRITICAL_FAILURE')).toBeVisible();
    await expect(page.getByTestId('template-item-INCIDENT_CRITICAL_REPORTED')).toBeVisible();
    await expect(page.getByTestId('template-item-MAINTENANCE_WORK_ORDER_CREATED')).toBeVisible();
    await expect(page.getByTestId('template-item-MAINTENANCE_WORK_ORDER_COMPLETED')).toBeVisible();
    await expect(page.getByTestId('template-item-COMPLIANCE_DOCUMENT_EXPIRING')).toBeVisible();

    // Verify template editing flow
    const editBtn = page.getByTestId('edit-template-btn-MAINTENANCE_WORK_ORDER_CREATED');
    await editBtn.click();

    await expect(page.getByTestId('edit-template-modal')).toBeVisible();
    const updatedTitle = `[Playwright Test ${timestamp}] Maintenance Update`;
    await page.getByTestId('title-template-input').fill(updatedTitle);
    await page.getByTestId('save-template-btn').click();

    // Verify success feedback
    await expect(page.getByTestId('template-feedback')).toBeVisible();
    await expect(page.getByTestId('template-feedback')).toContainText(
      "Template 'MAINTENANCE_WORK_ORDER_CREATED' updated successfully.",
    );

    // Verify updated title is rendered in the card
    const updatedCard = page.getByTestId('template-item-MAINTENANCE_WORK_ORDER_CREATED');
    await expect(updatedCard).toContainText(updatedTitle);
  });
});
