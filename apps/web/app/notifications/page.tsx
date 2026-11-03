'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { TenantHeader } from '../../components/tenant-header';
import {
  apiClient,
  type NotificationPriority,
  type UserNotificationItem,
} from '../../lib/api-client';

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<UserNotificationItem[]>([]);
  const [unreadOnly, setUnreadOnly] = useState<boolean>(false);
  const [totalUnread, setTotalUnread] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadNotifications = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.fetchNotifications({ unreadOnly, limit: 50 });
      setNotifications(res.items);
      setTotalUnread(res.totalUnread);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load notifications');
    } finally {
      setLoading(false);
    }
  }, [unreadOnly]);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  const handleMarkAsRead = async (id: string) => {
    try {
      await apiClient.markNotificationAsRead(id);
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === id ? { ...n, inAppRead: true, inAppReadAt: new Date().toISOString() } : n,
        ),
      );
      setTotalUnread((prev) => Math.max(0, prev - 1));
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('vms:notifications-read'));
      }
    } catch (err: unknown) {
      alert(`Failed to mark read: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await apiClient.markAllNotificationsAsRead();
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, inAppRead: true, inAppReadAt: new Date().toISOString() })),
      );
      setTotalUnread(0);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('vms:notifications-read'));
      }
    } catch (err: unknown) {
      alert(`Failed to mark all read: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const getPriorityStyle = (priority: NotificationPriority) => {
    switch (priority) {
      case 'CRITICAL':
        return { background: '#fee2e2', color: '#991b1b', border: '1px solid #f87171' };
      case 'HIGH':
        return { background: '#ffedd5', color: '#9a3412', border: '1px solid #fb923c' };
      case 'NORMAL':
        return { background: '#e0f2fe', color: '#075985', border: '1px solid #7dd3fc' };
      case 'LOW':
      default:
        return { background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1' };
    }
  };

  const getSourceDeepLink = (item: UserNotificationItem) => {
    if (!item.sourceAggregateType || !item.sourceAggregateId) return null;
    switch (item.sourceAggregateType) {
      case 'Incident':
        return { label: 'View Incident', href: `/incidents` };
      case 'Inspection':
        return { label: 'View Inspection', href: `/inspections` };
      case 'ComplianceDocument':
        return { label: 'View Compliance', href: `/compliance` };
      case 'MaintenanceWorkOrder':
      case 'MaintenanceRequest':
        return { label: 'View Maintenance', href: `/maintenance` };
      default:
        return null;
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <TenantHeader onAuthChange={loadNotifications} />

      <main style={{ maxWidth: '1000px', margin: '2rem auto', padding: '0 1rem' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: '1.5rem',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div>
            <h1
              style={{
                fontSize: '1.875rem',
                fontWeight: 700,
                color: '#0f172a',
                margin: '0 0 0.5rem 0',
              }}
            >
              In-App Notification Center
            </h1>
            <p style={{ color: '#64748b', margin: 0 }}>
              Operational alerts, safety notifications, and scheduled compliance warnings.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <Link
              href="/notifications/preferences"
              data-testid="nav-preferences"
              style={{
                padding: '0.5rem 0.875rem',
                borderRadius: '0.375rem',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#334155',
                textDecoration: 'none',
                fontWeight: 500,
                fontSize: '0.875rem',
              }}
            >
              Notification Preferences
            </Link>
            <Link
              href="/notifications/templates"
              data-testid="nav-templates"
              style={{
                padding: '0.5rem 0.875rem',
                borderRadius: '0.375rem',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#334155',
                textDecoration: 'none',
                fontWeight: 500,
                fontSize: '0.875rem',
              }}
            >
              Manage Templates
            </Link>
          </div>
        </div>

        {/* Toolbar */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: '#ffffff',
            padding: '1rem 1.25rem',
            borderRadius: '0.5rem',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            marginBottom: '1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span
              data-testid="unread-count-indicator"
              style={{
                fontWeight: 600,
                fontSize: '0.9rem',
                color: totalUnread > 0 ? '#dc2626' : '#16a34a',
              }}
            >
              {totalUnread} Unread {totalUnread === 1 ? 'Notification' : 'Notifications'}
            </span>

            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontSize: '0.875rem',
                color: '#475569',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                data-testid="unread-filter-toggle"
                checked={unreadOnly}
                onChange={(e) => setUnreadOnly(e.target.checked)}
              />
              Show Unread Only
            </label>
          </div>

          {totalUnread > 0 && (
            <button
              type="button"
              data-testid="mark-all-read-btn"
              onClick={() => void handleMarkAllAsRead()}
              style={{
                background: '#f1f5f9',
                border: '1px solid #cbd5e1',
                padding: '0.4rem 0.75rem',
                borderRadius: '0.375rem',
                fontSize: '0.875rem',
                fontWeight: 500,
                cursor: 'pointer',
                color: '#334155',
              }}
            >
              Mark all as read
            </button>
          )}
        </div>

        {error && (
          <div
            style={{
              padding: '1rem',
              marginBottom: '1rem',
              backgroundColor: '#fee2e2',
              color: '#991b1b',
              borderRadius: '0.375rem',
            }}
          >
            {error}
          </div>
        )}

        {/* List */}
        {loading && notifications.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
            Loading notifications...
          </div>
        ) : notifications.length === 0 ? (
          <div
            data-testid="empty-notifications"
            style={{
              textAlign: 'center',
              padding: '3rem',
              backgroundColor: '#ffffff',
              borderRadius: '0.5rem',
              color: '#64748b',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}
          >
            <p style={{ margin: 0, fontWeight: 500 }}>No notifications found.</p>
            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem' }}>
              {unreadOnly
                ? 'You have no unread notifications.'
                : 'Your notification feed is currently clear.'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {notifications.map((item) => {
              const priorityStyle = getPriorityStyle(item.priority);
              const deepLink = getSourceDeepLink(item);

              return (
                <div
                  key={item.id}
                  data-testid="notification-item"
                  data-notification-id={item.id}
                  style={{
                    backgroundColor: item.inAppRead ? '#ffffff' : '#f0fdf4',
                    border: item.inAppRead ? '1px solid #e2e8f0' : '1px solid #86efac',
                    borderRadius: '0.5rem',
                    padding: '1rem 1.25rem',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span
                        style={{
                          padding: '0.15rem 0.5rem',
                          borderRadius: '0.25rem',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          ...priorityStyle,
                        }}
                      >
                        {item.priority}
                      </span>
                      <span
                        style={{
                          padding: '0.15rem 0.5rem',
                          borderRadius: '0.25rem',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          background: '#e2e8f0',
                          color: '#334155',
                        }}
                      >
                        {item.category}
                      </span>
                      <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 500 }}>
                        {item.displayId}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <span
                        data-testid="read-status"
                        style={{
                          fontSize: '0.75rem',
                          color: item.inAppRead ? '#94a3b8' : '#15803d',
                          fontWeight: item.inAppRead ? 400 : 600,
                        }}
                      >
                        {item.inAppRead ? 'Read' : 'Unread'}
                      </span>
                      <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                        {new Date(item.createdAt).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  <div>
                    <h3
                      data-testid="notification-title"
                      style={{
                        margin: '0 0 0.25rem 0',
                        fontSize: '1rem',
                        fontWeight: item.inAppRead ? 600 : 700,
                        color: '#0f172a',
                      }}
                    >
                      {item.title}
                    </h3>
                    <p
                      data-testid="notification-body"
                      style={{
                        margin: 0,
                        fontSize: '0.9rem',
                        color: '#334155',
                        lineHeight: 1.4,
                      }}
                    >
                      {item.body}
                    </p>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginTop: '0.25rem',
                    }}
                  >
                    <div>
                      {deepLink && (
                        <Link
                          href={deepLink.href}
                          data-testid="source-entity-link"
                          style={{
                            fontSize: '0.875rem',
                            color: 'var(--accent, #1a56db)',
                            textDecoration: 'none',
                            fontWeight: 500,
                          }}
                        >
                          {deepLink.label} &rarr;
                        </Link>
                      )}
                    </div>

                    {!item.inAppRead && (
                      <button
                        type="button"
                        data-testid="mark-read-btn"
                        onClick={() => void handleMarkAsRead(item.id)}
                        style={{
                          background: '#ffffff',
                          border: '1px solid #cbd5e1',
                          padding: '0.25rem 0.6rem',
                          borderRadius: '0.25rem',
                          fontSize: '0.75rem',
                          fontWeight: 500,
                          cursor: 'pointer',
                          color: '#334155',
                        }}
                      >
                        Mark as read
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
