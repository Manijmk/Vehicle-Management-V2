'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { apiClient } from '../lib/api-client';

export function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState<number>(0);

  const fetchCount = async () => {
    try {
      const res = await apiClient.fetchUnreadNotificationCount();
      setUnreadCount(res.unreadCount);
    } catch {
      // Ignore background fetch error
    }
  };

  useEffect(() => {
    void fetchCount();
    const interval = setInterval(() => {
      void fetchCount();
    }, 10000);
    const handleRefresh = () => {
      void fetchCount();
    };
    window.addEventListener('vms:notifications-read', handleRefresh);
    return () => {
      clearInterval(interval);
      window.removeEventListener('vms:notifications-read', handleRefresh);
    };
  }, []);

  return (
    <Link
      href="/notifications"
      data-testid="notification-bell"
      aria-label={`Notifications, ${unreadCount} unread`}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0.4rem',
        borderRadius: '0.375rem',
        color: 'var(--text-primary, #1e293b)',
        textDecoration: 'none',
        background: 'transparent',
        cursor: 'pointer',
      }}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
      {unreadCount > 0 && (
        <span
          data-testid="notification-badge"
          style={{
            position: 'absolute',
            top: '-2px',
            right: '-2px',
            backgroundColor: '#ef4444',
            color: 'white',
            borderRadius: '9999px',
            padding: '0.1rem 0.35rem',
            fontSize: '0.7rem',
            fontWeight: 700,
            lineHeight: 1,
            minWidth: '1.1rem',
            textAlign: 'center',
          }}
        >
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </Link>
  );
}
