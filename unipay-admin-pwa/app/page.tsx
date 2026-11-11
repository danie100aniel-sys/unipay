'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AuthModal } from '@/app/components/AuthModal';
import { BiometricEnrollmentPrompt } from '@/app/components/BiometricEnrollmentPrompt';
import { PwainstallPrompt } from '@/app/components/PwainstallPrompt';
import { DashboardNavbar } from '@/app/components/DashboardNavbar';
import { NotificationDrawer } from '@/app/components/NotificationDrawer';
import { BottomNav } from '@/app/components/dashboard/BottomNav';
import { IdleSplash } from '@/app/components/dashboard/IdleSplash';
import { FeedTab } from '@/app/components/dashboard/tabs/FeedTab';
import { OrdersTab } from '@/app/components/dashboard/tabs/OrdersTab';
import { QueueTab } from '@/app/components/dashboard/tabs/QueueTab';
import { CommsTab } from '@/app/components/dashboard/tabs/CommsTab';
import { useAutoLock } from '@/app/hooks/useAutoLock';
import { adminFetch, getAdminApiBaseUrl } from './lib/adminApi';
import { SystemTab } from '@/app/components/dashboard/tabs/SystemTab';

const GLOBAL_ASSET_CONFIG = {
  dashboardBackground: '/bg-custom.jpg',
  splashScreenImage: '/screen-custom.png',
};

function DashboardMetricsGrid() {
  return (
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Dashboard metrics">
      <div className="border border-[#FFB000]/30 bg-black/30 p-3">
        <p className="text-xs text-[#FFB000]/70">STATUS</p>
        <p className="mt-1 text-lg">ONLINE</p>
      </div>
      <div className="border border-[#FFB000]/30 bg-black/30 p-3">
        <p className="text-xs text-[#FFB000]/70">ACTIVITY</p>
        <p className="mt-1 text-lg">LIVE</p>
      </div>
      <div className="border border-[#FFB000]/30 bg-black/30 p-3">
        <p className="text-xs text-[#FFB000]/70">SECURITY</p>
        <p className="mt-1 text-lg">SECURE</p>
      </div>
      <div className="border border-[#FFB000]/30 bg-black/30 p-3">
        <p className="text-xs text-[#FFB000]/70">SESSION</p>
        <p className="mt-1 text-lg">ACTIVE</p>
      </div>
    </section>
  );
}

export default function DashboardPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isRestoringSession, setIsRestoringSession] = useState(true);
  const [sessionRestoreError, setSessionRestoreError] = useState(false);

  interface AdminIdentity { admin_id?: string; username?: string; role?: string }
  interface LiveActivity { type: string; description: string; timestamp: string }
  interface NotificationItem { id: number; type: string; text: string; time: string; unread: boolean }
  const [admin, setAdmin] = useState<AdminIdentity | null>(null);
  const [needsBiometrics, setNeedsBiometrics] = useState(false);
  const [showBioPrompt, setShowBioPrompt] = useState(false);
  const [showSplash, setShowSplash] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'feed' | 'orders' | 'queue' | 'comms' | 'system'>('feed');

  const [liveActivities, setLiveActivities] = useState<LiveActivity[]>([
    { type: 'NODE_PING', description: 'Hardware Enclave signature validated successfully.', timestamp: '02:51 UTC' },
    { type: 'SETTLEMENT', description: 'Lightning Network invoice #8892 settled ($450.00).', timestamp: '02:48 UTC' }
  ]);

  const [notifications, setNotifications] = useState<NotificationItem[]>([
    { id: 1, type: 'ALERT', text: 'Hardware Enclave secure signature verified.', time: '02:51 UTC', unread: true },
    { id: 2, type: 'SUCCESS', text: 'Lightning Network invoice #8892 settled ($450.00).', time: '02:48 UTC', unread: true },
  ]);

  const handleClearUnread = () => {
    setNotifications(notifications.map(n => ({ ...n, unread: false })));
  };

  // Restore the authenticated admin identity from the backend on page reload.
  useEffect(() => {
    let cancelled = false;

    const restoreSession = async () => {
      const token = localStorage.getItem('unipay_token');

      if (!token) {
        setIsAuthenticated(false);
        setAdmin(null);
        setIsRestoringSession(false);
        return;
      }

      try {
        const data = await adminFetch('/profile');
        const restoredAdmin = data.admin as AdminIdentity | undefined;

        if (!restoredAdmin || !restoredAdmin.role || !restoredAdmin.admin_id) {
          throw new Error('The server returned an incomplete admin profile.');
        }

        if (!cancelled) {
          setAdmin(restoredAdmin);
          setIsAuthenticated(true);
          setSessionRestoreError(false);
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Admin session restoration failed:', error);

          if (localStorage.getItem('unipay_token')) {
            // Keep the token if this was a network or server error.
            setSessionRestoreError(true);
          } else {
            // The API helper removed an invalid/expired token.
            setIsAuthenticated(false);
            setAdmin(null);
          }
        }
      } finally {
        if (!cancelled) setIsRestoringSession(false);
      }
    };

    restoreSession();

    return () => {
      cancelled = true;
    };
  }, []);

  useAutoLock(() => {
    setIsAuthenticated(false);
    setAdmin(null);
  }, 3 * 60 * 1000);

  useEffect(() => {
    if (!GLOBAL_ASSET_CONFIG.splashScreenImage || !isAuthenticated) return;
    let timeoutTimer: NodeJS.Timeout;

    const resetTimer = () => {
      clearTimeout(timeoutTimer);
      timeoutTimer = setTimeout(() => setShowSplash(true), 60000);
    };

    window.addEventListener('mousemove', resetTimer);
    window.addEventListener('keydown', resetTimer);
    window.addEventListener('touchstart', resetTimer);
    resetTimer();

    return () => {
      clearTimeout(timeoutTimer);
      window.removeEventListener('mousemove', resetTimer);
      window.removeEventListener('keydown', resetTimer);
      window.removeEventListener('touchstart', resetTimer);
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;

    const controller = new AbortController();
    const streamUrl = `${getAdminApiBaseUrl()}/stream`;

    fetch(streamUrl, {
      headers: { Authorization: `Bearer ${typeof window !== "undefined" ? localStorage.getItem("unipay_token") || "" : ""}` },
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok || !response.body) throw new Error(`SSE stream failed: ${response.status}`);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (!controller.signal.aborted) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';
        for (const event of events) {
          const line = event.split('\n').find((entry) => entry.startsWith('data: '));
          if (!line) continue;
          const data = JSON.parse(line.slice(6)) as { type?: string; item_type?: string; amount_usd?: string | number; ip?: string };
          if (data.type === 'CONNECTED') continue;

          const timeString = new Date().toLocaleTimeString();
          const descriptionText = data.type === 'SDK_OPENED'
            ? `Checkout opened for ${data.item_type || 'Product'} ($${data.amount_usd || 'Custom'}) from IP ${data.ip}`
            : JSON.stringify(data);

          setLiveActivities((prev) => [
            { type: data.type || 'EVENT', description: descriptionText, timestamp: timeString },
            ...prev.slice(0, 19)
          ]);

          setNotifications((prev) => [
            { id: Date.now(), type: data.type || 'EVENT', text: descriptionText, time: timeString, unread: true },
            ...prev.slice(0, 24)
          ]);
        }
      }
    }).catch((error) => {
      if (!controller.signal.aborted) console.error('SSE stream error:', error);
    });

    return () => { controller.abort(); };
  }, [isAuthenticated]);

  const handleAuthenticated = (adminData: AdminIdentity, needsBiometricEnrollment: boolean) => {
    setAdmin(adminData);
    setIsAuthenticated(true);
    setNeedsBiometrics(needsBiometricEnrollment);
    if (needsBiometricEnrollment) setShowBioPrompt(true);
  };

  const handleLock = () => {
    localStorage.removeItem('unipay_token');
    setIsAuthenticated(false);
    setAdmin(null);
  };

  if (isRestoringSession) {
    return (
      <main className="min-h-screen bg-[#07080B] text-[#FFB000] flex items-center justify-center font-mono">
        RESTORING ADMIN SESSION...
      </main>
    );
  }

  if (sessionRestoreError) {
    return (
      <main className="min-h-screen bg-[#07080B] text-[#FFB000] flex flex-col items-center justify-center gap-4 font-mono">
        <p>UNABLE TO RESTORE ADMIN SESSION</p>
        <p className="text-sm text-[#FFB000]/70">Check your connection and try again.</p>
        <button
          onClick={() => window.location.reload()}
          className="border border-[#FFB000] px-5 py-2 hover:bg-[#FFB000]/10"
        >
          RETRY
        </button>
      </main>
    );
  }

  if (!isAuthenticated) {
    return <AuthModal onAuthenticated={handleAuthenticated} />;
  }

  const bgStyle = GLOBAL_ASSET_CONFIG.dashboardBackground
    ? { backgroundImage: `linear-gradient(rgba(7, 8, 11, 0.8), rgba(7, 8, 11, 0.9)), url('${GLOBAL_ASSET_CONFIG.dashboardBackground}')` }
    : { backgroundColor: '#07080B' };

  return (
    <main className="min-h-screen text-[#FFB000] font-mono flex flex-col pb-28 bg-cover bg-center bg-fixed relative" style={bgStyle}>
      <AnimatePresence>
        {showSplash && GLOBAL_ASSET_CONFIG.splashScreenImage && (
          <IdleSplash
            splashImage={GLOBAL_ASSET_CONFIG.splashScreenImage}
            onResume={() => setShowSplash(false)}
          />
        )}
      </AnimatePresence>

      <DashboardNavbar
        username={admin?.username || 'superadmin'}
        onLock={handleLock}
        onOpenNotifications={() => setIsNotificationOpen(true)}
        notifications={notifications}
      />

      <NotificationDrawer
        isOpen={isNotificationOpen}
        onClose={() => setIsNotificationOpen(false)}
        notifications={notifications}
        onClearUnread={handleClearUnread}
      />

      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 max-w-5xl mx-auto w-full flex-1">
        <DashboardMetricsGrid />

        <AnimatePresence mode="wait">
          {activeTab === 'feed' && (
            <motion.div key="feed" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
              <FeedTab liveActivities={liveActivities} />
            </motion.div>
          )}

          {activeTab === 'orders' && (
            <motion.div key="orders" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
              <OrdersTab />
            </motion.div>
          )}

          {activeTab === 'queue' && (
            <motion.div key="queue" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
              <QueueTab />
            </motion.div>
          )}

          {activeTab === 'comms' && (
            <motion.div key="comms" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
              <CommsTab role={admin?.role} />
            </motion.div>
          )}
          {activeTab === 'system' && (
            <motion.div key="system" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
              <SystemTab role={admin?.role} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <BottomNav activeTab={activeTab} onChangeTab={setActiveTab} />

      {showBioPrompt && needsBiometrics && (
        <BiometricEnrollmentPrompt
          username={admin?.username || 'superadmin'}
          onEnrolled={() => setShowBioPrompt(false)}
          onDismiss={() => setShowBioPrompt(false)}
        />
      )}
      <PwainstallPrompt />
    </main>
  );
}
