'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Terminal, Users, Bell, Database, Globe, Key, Activity, Send, UserPlus, Lock, CheckCircle, XCircle } from 'lucide-react';
import { adminFetch } from '../../../lib/adminApi';

interface SystemTabProps {
  role?: string;
}

interface Giftcard { giftcard_id: string; brand: string; face_value_usd: number | string; image_url?: string; receipt_path?: string; order_status: string }
interface Voucher { voucher_id: string; rail: string; amount_usd?: number | string; expected_amount?: number | string; status?: string }
interface WebhookLog { id: string; provider: string; signature_valid: boolean; order_id?: string; created_at: string }
interface Site { site_id: string; display_name: string; site_url: string; active: boolean; created_at: string }
interface MerchantKey { site_id: string; display_name: string; active: boolean; created_at: string }
interface WidgetSession { id: string; session_id: string; client_ip: string; updated_at: string }
interface SystemApiResponse extends Record<string, unknown> { success?: boolean; logs?: WebhookLog[]; giftcards?: Giftcard[]; vouchers?: Voucher[]; sites?: Site[]; keys?: MerchantKey[]; sessions?: WidgetSession[]; users?: AdminUser[]; code?: string; pin?: string; admin?: AdminUser }

interface AdminUser {
  admin_id: string;
  username: string;
  role: string;
  lock_timeout_minutes: number;
  is_active: boolean;
  created_at: string;
}

// Sub-component for individual giftcard rows to properly encapsulate reveal/copy states
function GiftcardRow({ gc }: { gc: Giftcard }) {
  const [revealed, setRevealed] = useState(false);
  const [code, setCode] = useState('');
  const maskedCode = '••••-••••';
  const imageUrl = gc.image_url || gc.receipt_path;

  const handleRevealOrCopy = async (actionType: string, textToCopy?: string) => {
    try {
      await adminFetch(`/giftcards/${gc.giftcard_id}/audit`, {
        method: 'POST',
        body: JSON.stringify({ action: actionType })
      });
    } catch (err) {
      console.error('Failed to log audit event', err);
    }

    if (actionType === 'COPY_CODE' && textToCopy) {
      navigator.clipboard.writeText(textToCopy);
      alert('Gift card code copied to clipboard. Activity logged & superadmin notified.');
    } else if (actionType === 'VIEW_CODE') {
      const data = await adminFetch<{ code?: string }>(`/giftcards/${gc.giftcard_id}/reveal`);
      setCode(data.code || '');
      setRevealed(true);
    }
  };

  const handleSaveImage = async (url: string) => {
    try {
      await adminFetch(`/giftcards/${gc.giftcard_id}/audit`, {
        method: 'POST',
        body: JSON.stringify({ action: 'SAVE_IMAGE' })
      });

      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `${gc.brand}-giftcard-${gc.giftcard_id}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch {
      alert('Failed to download image');
    }
  };

  return (
    <tr className="border-b border-[#FFB000]/10">
      <td className="p-2 font-bold">{gc.brand}</td>
      <td className="p-2">${gc.face_value_usd}</td>
      <td className="p-2 font-mono text-[11px] flex items-center gap-2">
        <span>{revealed ? (code || 'No Code Provided') : maskedCode}</span>
        {!revealed ? (
          <button
            onClick={() => handleRevealOrCopy('VIEW_CODE')}
            className="text-[9px] bg-[#FFB000]/20 text-[#FFB000] px-1.5 py-0.5 border border-[#FFB000]/40 uppercase cursor-pointer"
          >
            View
          </button>
        ) : (
          <button
            onClick={() => handleRevealOrCopy('COPY_CODE', code)}
            className="text-[9px] bg-[#FFB000] text-black font-bold px-1.5 py-0.5 uppercase cursor-pointer"
          >
            Copy
          </button>
        )}
      </td>
      <td className="p-2">
        {imageUrl ? (
          <div className="flex items-center gap-2">
            <a
              href={imageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#FFB000] underline text-[10px]"
            >
              Preview
            </a>
            <button
              onClick={() => imageUrl && handleSaveImage(imageUrl)}
              className="text-[9px] bg-[#FFB000] text-black font-bold px-2 py-1 uppercase cursor-pointer"
            >
              Save to Phone
            </button>
          </div>
        ) : (
          <span className="opacity-40 text-[10px]">No Image</span>
        )}
      </td>
      <td className="p-2">{gc.order_status}</td>
    </tr>
  );
}

// Sub-component for individual voucher rows with audit protection and masked PIN handling
function VoucherRow({ vc }: { vc: Voucher }) {
  const [revealed, setRevealed] = useState(false);
  const [pin, setPin] = useState('');
  const maskedPin = '••••-••••';

  const handleAuditAction = async (actionType: 'VIEW_PIN' | 'COPY_PIN', textToCopy?: string) => {
    try {
      await adminFetch(`/vouchers/${vc.voucher_id}/audit`, {
        method: 'POST',
        body: JSON.stringify({ action: actionType })
      });
    } catch (err) {
      console.error('Failed to log voucher audit event', err);
    }

    if (actionType === 'COPY_PIN' && textToCopy) {
      navigator.clipboard.writeText(textToCopy);
      alert('Voucher PIN copied to clipboard. Access logged & Superadmin notified.');
    } else if (actionType === 'VIEW_PIN') {
      const data = await adminFetch<{ pin?: string }>(`/vouchers/${vc.voucher_id}/reveal`);
      setPin(data.pin || '');
      setRevealed(true);
    }
  };

  return (
    <tr className="border-b border-[#FFB000]/10 hover:bg-[#FFB000]/5 transition-colors">
      <td className="p-2 font-mono text-[11px]">{vc.voucher_id.substring(0, 8)}...</td>
      <td className="p-2 font-bold text-gray-200">{vc.rail}</td>
      <td className="p-2 font-mono">${vc.amount_usd || vc.expected_amount || '0.00'}</td>
      <td className="p-2 font-mono text-[11px]">
        <div className="flex items-center gap-2">
          <span className="bg-black/60 px-2 py-0.5 rounded border border-white/10 text-gray-300">
            {revealed ? pin : maskedPin}
          </span>
          {!revealed ? (
            <button
              onClick={() => handleAuditAction('VIEW_PIN')}
              className="text-[9px] bg-[#FFB000]/20 text-[#FFB000] px-1.5 py-0.5 border border-[#FFB000]/40 uppercase cursor-pointer"
            >
              View
            </button>
          ) : (
            <button
              onClick={() => handleAuditAction('COPY_PIN', pin)}
              className="text-[9px] bg-[#FFB000] text-black font-bold px-1.5 py-0.5 uppercase cursor-pointer"
            >
              Copy
            </button>
          )}
        </div>
      </td>
      <td className="p-2 font-mono">
        <span className={`px-1.5 py-0.5 rounded text-[10px] ${vc.status === 'PENDING_REVIEW' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
          }`}>
          {vc.status || 'PENDING_REVIEW'}
        </span>
      </td>
    </tr>
  );
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const raw = window.atob(base64);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

export function SystemTab({ role }: SystemTabProps) {
  const isSuperAdmin = role === 'superadmin';

  const availableTabs = isSuperAdmin
    ? ['users', 'sites', 'keys', 'sessions', 'webhooks', 'assets', 'push']
    : ['sites', 'keys', 'sessions', 'webhooks', 'assets', 'push'];

  const [activeSubTab, setActiveSubTab] = useState<string>(availableTabs[0]);

  const [webhooks, setWebhooks] = useState<WebhookLog[]>([]);
  const [giftcards, setGiftcards] = useState<Giftcard[]>([]);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [keys, setKeys] = useState<MerchantKey[]>([]);
  const [newSiteId, setNewSiteId] = useState('');
  const [newSiteName, setNewSiteName] = useState('');
  const [newSiteUrl, setNewSiteUrl] = useState('');
  const [siteBusy, setSiteBusy] = useState(false);
  const [siteMsg, setSiteMsg] = useState({ text: '', error: false });
  const [sessions, setSessions] = useState<WidgetSession[]>([]);

  // Users state management for 'users' subtab
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('admin');
  const lockTimeout = 3;
  const [userMsg, setUserMsg] = useState({ text: '', error: false });
  const [loading, setLoading] = useState(false);

  // Selected user for inline password change
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [adminNewPwd, setAdminNewPwd] = useState('');
  const [pwdMsg, setPwdMsg] = useState({ text: '', error: false });

  const [pushTitle, setPushTitle] = useState('');
  const [pushBody, setPushBody] = useState('');
  const [pushStatus, setPushStatus] = useState('');
  const [pushBusy, setPushBusy] = useState(false);


  const fetchSystemData = useCallback(async () => {
    try {
      const promises: Promise<SystemApiResponse>[] = [
        adminFetch<SystemApiResponse>('/logs/webhooks?limit=25'),
        adminFetch<SystemApiResponse>('/giftcards?limit=25'),
        adminFetch<SystemApiResponse>('/vouchers?limit=25'),
        adminFetch<SystemApiResponse>('/sites'),
        adminFetch<SystemApiResponse>('/merchant-keys'),
        adminFetch<SystemApiResponse>('/widget-sessions?limit=25')
      ];

      if (isSuperAdmin) {
        promises.push(adminFetch<SystemApiResponse>('/users'));
      }

      const results = await Promise.allSettled(promises);

      if (results[0].status === 'fulfilled' && results[0].value.success) setWebhooks(results[0].value.logs || []);
      if (results[1].status === 'fulfilled' && results[1].value.success) setGiftcards(results[1].value.giftcards || []);
      if (results[2].status === 'fulfilled' && results[2].value.success) setVouchers(results[2].value.vouchers || []);
      if (results[3].status === 'fulfilled' && results[3].value.success) setSites(results[3].value.sites || []);
      if (results[4].status === 'fulfilled' && results[4].value.success) setKeys(results[4].value.keys || []);
      if (results[5].status === 'fulfilled' && results[5].value.success) setSessions(results[5].value.sessions || []);

      if (isSuperAdmin && results[6] && results[6].status === 'fulfilled' && results[6].value.success) {
        setUsers(results[6].value.users || []);
      }
    } catch (e) {
      console.error('Failed to fetch system data:', e);
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    const timer = setTimeout(() => { void fetchSystemData(); }, 0);
    return () => clearTimeout(timer);
  }, [fetchSystemData]);

  const handleCreateSite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSuperAdmin || siteBusy) return;

    setSiteBusy(true);
    setSiteMsg({ text: '', error: false });

    try {
      const res = await adminFetch<SystemApiResponse>('/sites', {
        method: 'POST',
        body: JSON.stringify({
          site_id: newSiteId.trim(),
          display_name: newSiteName.trim(),
          site_url: newSiteUrl.trim()
        })
      });

      if (!res.success) throw new Error('Website registration failed');

      setSiteMsg({ text: 'Website registered successfully.', error: false });
      setNewSiteId('');
      setNewSiteName('');
      setNewSiteUrl('');
      await fetchSystemData();
    } catch (err: unknown) {
      setSiteMsg({
        text: err instanceof Error ? err.message : 'Website registration failed.',
        error: true
      });
    } finally {
      setSiteBusy(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSuperAdmin) return;
    setLoading(true);
    setUserMsg({ text: '', error: false });
    try {
      const res = await adminFetch<SystemApiResponse>('/users', {
        method: 'POST',
        body: JSON.stringify({
          username: newUsername,
          password: newPassword,
          role: newRole,
          lock_timeout_minutes: Number(lockTimeout)
        })
      });
      if (res.success) {
        setUserMsg({ text: `Account '${res.admin?.username || 'Admin'}' provisioned successfully.`, error: false });
        setNewUsername('');
        setNewPassword('');
        fetchSystemData();
      }
    } catch (err: unknown) {
      setUserMsg({ text: err instanceof Error ? err.message : 'Failed to create account.', error: true });
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStatus = async (id: string, currentStatus: boolean) => {
    try {
      const res = await adminFetch(`/users/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: !currentStatus })
      });
      if (res.success) {
        fetchSystemData();
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to update user status.');
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId) return;
    setPwdMsg({ text: '', error: false });
    try {
      const res = await adminFetch(`/users/${selectedUserId}/password`, {
        method: 'PUT',
        body: JSON.stringify({ newPassword: adminNewPwd })
      });
      if (res.success) {
        setPwdMsg({ text: 'Password updated successfully.', error: false });
        setAdminNewPwd('');
        setSelectedUserId(null);
      }
    } catch (err: unknown) {
      setPwdMsg({ text: err instanceof Error ? err.message : 'Failed to update password.', error: true });
    }
  };

  const handleEnablePush = async () => {
    if (pushBusy) return;

    setPushBusy(true);
    setPushStatus('');

    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        throw new Error('This browser does not support push notifications.');
      }

      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!publicKey) {
        throw new Error('Public VAPID key is missing from the frontend configuration.');
      }

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        throw new Error('Notification permission was not granted.');
      }

      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
        });
      }

      await adminFetch('/push/subscribe', {
        method: 'POST',
        body: JSON.stringify(subscription.toJSON()),
      });

      setPushStatus('Notifications enabled on this device.');
    } catch (err) {
      setPushStatus(
        err instanceof Error ? err.message : 'Could not enable notifications.'
      );
    } finally {
      setPushBusy(false);
    }
  };

  const handleSendPush = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSuperAdmin) return;
    if (!pushTitle.trim() || !pushBody.trim()) return;
    try {
      const res = await adminFetch('/push/send', {
        method: 'POST',
        body: JSON.stringify({ title: pushTitle, body: pushBody })
      });
      if (res.success) {
        alert('Push broadcast dispatched.');
        setPushTitle('');
        setPushBody('');
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error triggering push broadcast');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 border-b border-[#FFB000]/20 pb-3">
        {availableTabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveSubTab(tab)}
            className={`px-3 py-1.5 text-[10px] uppercase tracking-wider transition cursor-pointer ${activeSubTab === tab ? 'bg-[#FFB000] text-black font-bold' : 'bg-black/40 text-[#FFB000] border border-[#FFB000]/30 hover:bg-[#FFB000]/10'}`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeSubTab === 'users' && isSuperAdmin && (
        <div className="space-y-6">
          {/* Provision New Admin Card */}
          <div className="bg-[#12141C]/90 border border-[#FFB000]/30 p-4 space-y-4">
            <h3 className="text-xs font-bold tracking-widest text-[#FFB000] uppercase flex items-center gap-2">
              <UserPlus className="w-4 h-4" /> Provision Admin Account
            </h3>
            <form onSubmit={handleCreateUser} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input type="text" placeholder="USERNAME" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} className="bg-black border border-[#FFB000]/30 p-2 text-xs text-white focus:border-[#FFB000] outline-none" required />
                <input type="password" placeholder="PASSWORD" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="bg-black border border-[#FFB000]/30 p-2 text-xs text-white focus:border-[#FFB000] outline-none" required />
                <select value={newRole} onChange={(e) => setNewRole(e.target.value)} className="bg-black border border-[#FFB000]/30 p-2 text-xs text-white focus:border-[#FFB000] outline-none uppercase">
                  <option value="admin">Admin</option>
                  <option value="superadmin">Superadmin</option>
                </select>
              </div>
              {userMsg.text && (
                <p className={`text-[10px] ${userMsg.error ? 'text-red-400' : 'text-emerald-400'}`}>{userMsg.text}</p>
              )}
              <button type="submit" disabled={loading} className="bg-[#FFB000] text-black font-bold px-4 py-2 text-[10px] uppercase cursor-pointer">
                {loading ? 'Working...' : 'Create Account'}
              </button>
            </form>
          </div>

          {/* Admin Accounts Directory & Management */}
          <div className="bg-[#12141C]/90 border border-[#FFB000]/30 p-4 space-y-3">
            <h3 className="text-xs font-bold tracking-widest text-[#FFB000] uppercase flex items-center gap-2">
              <Users className="w-4 h-4" /> Admin Accounts Directory
            </h3>
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#FFB000]/20 text-[#FFB000]/70 text-[10px]">
                  <th className="p-2">Username</th>
                  <th className="p-2">Role</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Timeout</th>
                  <th className="p-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.admin_id} className="border-b border-[#FFB000]/10 hover:bg-[#FFB000]/5">
                    <td className="p-2 font-mono text-[11px] text-gray-200">{u.username}</td>
                    <td className="p-2 uppercase text-[10px] font-bold text-[#FFB000]">{u.role}</td>
                    <td className="p-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] flex items-center gap-1 w-fit ${u.is_active ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'
                        }`}>
                        {u.is_active ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                        {u.is_active ? 'Active' : 'Frozen'}
                      </span>
                    </td>
                    <td className="p-2 font-mono text-gray-400">{u.lock_timeout_minutes}m</td>
                    <td className="p-2 text-right space-x-2">
                      <button
                        onClick={() => handleToggleStatus(u.admin_id, u.is_active)}
                        className={`px-2 py-1 text-[9px] uppercase font-bold cursor-pointer transition ${u.is_active ? 'bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500/30' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-500/30'
                          }`}
                      >
                        {u.is_active ? 'Freeze' : 'Activate'}
                      </button>
                      <button
                        onClick={() => setSelectedUserId(selectedUserId === u.admin_id ? null : u.admin_id)}
                        className="px-2 py-1 bg-[#FFB000]/20 text-[#FFB000] border border-[#FFB000]/40 text-[9px] uppercase font-bold cursor-pointer hover:bg-[#FFB000]/30 transition"
                      >
                        Change Pwd
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Inline Password Reset Section */}
            {selectedUserId && (
              <div className="mt-4 p-3 bg-black/60 border border-[#FFB000]/40 space-y-2">
                <p className="text-[10px] text-[#FFB000] uppercase font-bold flex items-center gap-1">
                  <Lock className="w-3 h-3" /> Update Password for User ID: {selectedUserId}
                </p>
                <form onSubmit={handleChangePassword} className="flex gap-2">
                  <input
                    type="password"
                    placeholder="NEW PASSWORD"
                    value={adminNewPwd}
                    onChange={(e) => setAdminNewPwd(e.target.value)}
                    className="bg-black border border-[#FFB000]/30 p-2 text-xs text-white focus:border-[#FFB000] outline-none flex-1"
                    required
                  />
                  <button type="submit" className="bg-[#FFB000] text-black font-bold px-3 py-2 text-[10px] uppercase cursor-pointer">
                    Save
                  </button>
                  <button type="button" onClick={() => setSelectedUserId(null)} className="bg-white/10 text-white px-3 py-2 text-[10px] uppercase cursor-pointer">
                    Cancel
                  </button>
                </form>
                {pwdMsg.text && (
                  <p className={`text-[10px] ${pwdMsg.error ? 'text-red-400' : 'text-emerald-400'}`}>{pwdMsg.text}</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {activeSubTab === 'sites' && (
        <div className="space-y-4">
          {isSuperAdmin && (
            <form onSubmit={handleCreateSite} className="bg-[#12141C]/90 border border-[#FFB000]/30 p-4 space-y-3">
              <h3 className="text-xs font-bold tracking-widest uppercase flex items-center gap-2">
                <Globe className="w-4 h-4" /> Register Your Website
              </h3>
              <input
                value={newSiteId}
                onChange={(e) => setNewSiteId(e.target.value)}
                placeholder="SITE ID (e.g. my_store)"
                pattern="[a-zA-Z0-9_-]{2,80}"
                maxLength={80}
                required
                className="w-full bg-black border border-[#FFB000]/30 p-2 text-xs text-white outline-none"
              />
              <input
                value={newSiteName}
                onChange={(e) => setNewSiteName(e.target.value)}
                placeholder="DISPLAY NAME"
                maxLength={120}
                required
                className="w-full bg-black border border-[#FFB000]/30 p-2 text-xs text-white outline-none"
              />
              <input
                type="url"
                value={newSiteUrl}
                onChange={(e) => setNewSiteUrl(e.target.value)}
                placeholder="https://yourwebsite.com"
                required
                className="w-full bg-black border border-[#FFB000]/30 p-2 text-xs text-white outline-none"
              />
              <button
                type="submit"
                disabled={siteBusy}
                className="bg-[#FFB000] text-black font-bold px-4 py-2 text-[10px] uppercase disabled:opacity-50"
              >
                {siteBusy ? 'Registering...' : 'Register Website'}
              </button>
              {siteMsg.text && (
                <p className={`text-xs ${siteMsg.error ? 'text-red-400' : 'text-emerald-400'}`}>
                  {siteMsg.text}
                </p>
              )}
            </form>
          )}

          <div className="bg-[#12141C]/90 border border-[#FFB000]/30 p-4 space-y-3">
          <h3 className="text-xs font-bold tracking-widest uppercase flex items-center gap-2"><Globe className="w-4 h-4" /> Registered Sites</h3>
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#FFB000]/20 text-[#FFB000]/70 text-[10px]">
                <th className="p-2">Domain</th>
                <th className="p-2">Status</th>
                <th className="p-2">Created</th>
              </tr>
            </thead>
            <tbody>
              {sites.map(site => (
                <tr key={site.site_id} className="border-b border-[#FFB000]/10">
                  <td className="p-2">
                    <div className="font-mono text-[11px]">{site.display_name}</div>
                    <div className="opacity-50 text-[10px]">{site.site_url}</div>
                    <div className="opacity-40 text-[9px]">{site.site_id}</div>
                  </td>
                  <td className="p-2">{site.active ? 'Active' : 'Inactive'}</td>
                  <td className="p-2 opacity-60">{new Date(site.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {activeSubTab === 'keys' && (
        <div className="bg-[#12141C]/90 border border-[#FFB000]/30 p-4 space-y-3">
          <h3 className="text-xs font-bold tracking-widest uppercase flex items-center gap-2"><Key className="w-4 h-4" /> Merchant Keys</h3>
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#FFB000]/20 text-[#FFB000]/70 text-[10px]">
                <th className="p-2">Website</th>
                <th className="p-2">Status</th>
                <th className="p-2">Created</th>
              </tr>
            </thead>
            <tbody>
              {keys.map(k => (
                <tr key={k.site_id} className="border-b border-[#FFB000]/10">
                  <td className="p-2">
                    <div>{k.display_name}</div>
                    <div className="opacity-50 font-mono text-[10px]">{k.site_id}</div>
                  </td>
                  <td className="p-2">{k.active ? 'Active' : 'Inactive'}</td>
                  <td className="p-2 opacity-60">{new Date(k.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeSubTab === 'sessions' && (
        <div className="bg-[#12141C]/90 border border-[#FFB000]/30 p-4 space-y-3">
          <h3 className="text-xs font-bold tracking-widest uppercase flex items-center gap-2"><Activity className="w-4 h-4" /> Active Widget Sessions</h3>
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#FFB000]/20 text-[#FFB000]/70 text-[10px]">
                <th className="p-2">Session ID</th>
                <th className="p-2">IP Address</th>
                <th className="p-2">Last Active</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map(s => (
                <tr key={s.id} className="border-b border-[#FFB000]/10">
                  <td className="p-2 font-mono text-[11px]">{s.session_id.substring(0, 8)}...</td>
                  <td className="p-2">{s.client_ip}</td>
                  <td className="p-2 opacity-60">{new Date(s.updated_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeSubTab === 'webhooks' && (
        <div className="bg-[#12141C]/90 border border-[#FFB000]/30 p-4 space-y-3">
          <h3 className="text-xs font-bold tracking-widest uppercase flex items-center gap-2"><Terminal className="w-4 h-4" /> Webhook Logs</h3>
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#FFB000]/20 text-[#FFB000]/70 text-[10px]">
                <th className="p-2">Provider</th>
                <th className="p-2">Signature Valid</th>
                <th className="p-2">Order ID</th>
                <th className="p-2">Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {webhooks.map(log => (
                <tr key={log.id} className="border-b border-[#FFB000]/10">
                  <td className="p-2 font-bold">{log.provider}</td>
                  <td className="p-2">{log.signature_valid ? 'Valid' : 'Invalid'}</td>
                  <td className="p-2 font-mono text-[11px]">{log.order_id || 'N/A'}</td>
                  <td className="p-2 opacity-60">{new Date(log.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeSubTab === 'push' && (
        <div className="bg-[#12141C]/90 border border-[#FFB000]/30 p-4 space-y-4">
          <h3 className="text-xs font-bold tracking-widest uppercase flex items-center gap-2"><Bell className="w-4 h-4" /> Admin Push Notifications</h3>
          <div className="space-y-2">
            <button
              type="button"
              onClick={handleEnablePush}
              disabled={pushBusy}
              className="border border-[#FFB000]/50 text-[#FFB000] px-4 py-2 text-[10px] uppercase disabled:opacity-50"
            >
              {pushBusy ? 'Enabling...' : 'Enable Notifications on This Device'}
            </button>
            {pushStatus && (
              <p role="status" className="text-xs text-gray-300">{pushStatus}</p>
            )}
          </div>
          {isSuperAdmin ? (
            <form onSubmit={handleSendPush} className="space-y-3 pt-2">
              <input type="text" placeholder="ALERT TITLE" value={pushTitle} onChange={(e) => setPushTitle(e.target.value)} className="w-full bg-black border border-[#FFB000]/30 p-2 text-xs focus:border-[#FFB000] outline-none" required />
              <textarea placeholder="ALERT PAYLOAD / BODY" rows={3} value={pushBody} onChange={(e) => setPushBody(e.target.value)} className="w-full bg-black border border-[#FFB000]/30 p-2 text-xs focus:border-[#FFB000] outline-none resize-none" required />
              <button type="submit" className="bg-[#FFB000] text-black font-bold px-4 py-2 text-[10px] uppercase cursor-pointer flex items-center gap-2">
                <Send className="w-3 h-3" /> Broadcast to Admins
              </button>
            </form>
          ) : (
            <p className="text-xs text-gray-400 pt-2">
              You can enable notifications on this device. Global broadcasts are managed by a superadmin.
            </p>
          )}
        </div>
      )}

      {activeSubTab === 'assets' && (
        <div className="space-y-4">
          {/* Gift Cards Ledger */}
          <div className="bg-[#12141C]/90 border border-[#FFB000]/30 p-4 space-y-3">
            <h3 className="text-xs font-bold tracking-widest uppercase flex items-center gap-2">
              <Database className="w-4 h-4" /> Gift Cards Ledger
            </h3>
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#FFB000]/20 text-[#FFB000]/70 text-[10px]">
                  <th className="p-2">Brand</th>
                  <th className="p-2">Face Value</th>
                  <th className="p-2">Code / Digits</th>
                  <th className="p-2">Receipt / Image</th>
                  <th className="p-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {giftcards.length === 0 ? (
                  <tr><td colSpan={5} className="p-4 text-center opacity-40 text-[10px] uppercase">No gift cards recorded</td></tr>
                ) : (
                  giftcards.map(gc => <GiftcardRow key={gc.giftcard_id} gc={gc} />)
                )}
              </tbody>
            </table>
          </div>

          {/* Payment Vouchers Ledger */}
          <div className="bg-[#12141C]/90 border border-[#FFB000]/30 p-4 space-y-3">
            <h3 className="text-xs font-bold tracking-widest uppercase flex items-center gap-2">
              <Database className="w-4 h-4" /> Payment Vouchers Ledger
            </h3>
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#FFB000]/20 text-[#FFB000]/70 text-[10px]">
                  <th className="p-2">Voucher ID</th>
                  <th className="p-2">Rail</th>
                  <th className="p-2">Amount</th>
                  <th className="p-2">PIN / Credential</th>
                  <th className="p-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {vouchers.length === 0 ? (
                  <tr><td colSpan={5} className="p-4 text-center opacity-40 text-[10px] uppercase">No active vouchers found</td></tr>
                ) : (
                  vouchers.map(vc => <VoucherRow key={vc.voucher_id} vc={vc} />)
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}