'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Fingerprint, ShieldAlert, Lock, User, KeyRound } from 'lucide-react';
import { startAuthentication } from '@simplewebauthn/browser';
import { readJsonResponse } from '@/app/lib/api';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

/* ========================================================================== */
/* ASSET CONFIGURATION // Easily swap, update, or set to `null` to remove    */
/* ========================================================================== */
const ASSET_CONFIG = {
  modalBackground: '/bg-custom.jpg',      // Global background for the gate
  splashBannerImage: '/screen-custom.png', // Striking banner/splash graphic for the login screen
};

interface AdminIdentity {
  admin_id: string;
  username: string;
  role: string;
}

interface AuthResponse {
  success: boolean;
  error?: string;
  sessionToken?: string;
  needsBiometricEnrollment?: boolean;
  admin?: AdminIdentity;
}

interface ChallengeResponse {
  success: boolean;
  error?: string;
  needsRegistration?: boolean;
  options?: Parameters<typeof startAuthentication>[0]['optionsJSON'];
}

export function AuthModal({ onAuthenticated }: { onAuthenticated: (adminData: AdminIdentity, needsBiometrics: boolean) => void }) {
  const [identifier, setIdentifier] = useState('superadmin');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState('Secure Enclave Gate');
  const [error, setError] = useState('');

  // 1. Standard Password Login
  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      setStatusText('Authenticating credentials...');
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password }),
      });
      const data = await readJsonResponse<AuthResponse>(res);
      if (!res.ok || !data.success) {
        throw new Error(data?.error || 'Authentication failed.');
      }

      if (!data.sessionToken || !data.admin) throw new Error('Authentication response was incomplete.');
      localStorage.setItem('unipay_token', data.sessionToken);
      onAuthenticated(data.admin, Boolean(data.needsBiometricEnrollment));

    } catch (err: unknown) {
      console.error('Login Error:', err);
      setError(err instanceof Error ? err.message : 'Login sequence aborted.');
      setStatusText('Secure Enclave Gate');
    } finally {
      setLoading(false);
    }
  };

  // 2. Quick Biometric Passkey Login
  const handleBiometricLogin = async () => {
    if (!identifier) {
      setError('Enter your Operator ID or Email first to use biometrics.');
      return;
    }

    if (!window.isSecureContext) {
      setError('Passkey sign-in requires HTTPS. Use password sign-in or open the secure admin site.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      setStatusText('Requesting hardware challenge...');
      const challengeRes = await fetch(`${API_BASE}/api/auth/challenge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: identifier }),
      });
      const challengeData = await readJsonResponse<ChallengeResponse>(challengeRes);
      if (!challengeRes.ok || !challengeData.success) {
        throw new Error(challengeData?.error || 'Failed to initialize biometric challenge.');
      }

      if (challengeData.needsRegistration) {
        throw new Error('No passkey registered for this operator. Please log in with your password first to register.');
      }

      if (!challengeData.options) throw new Error('Biometric challenge options were missing.');
      setStatusText('Awaiting hardware security enclave...');
      const authResponse = await startAuthentication({ optionsJSON: challengeData.options });

      setStatusText('Verifying biometric signature...');
      const verifyRes = await fetch(`${API_BASE}/api/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: identifier, credential: authResponse }),
      });
      const verifyData = await readJsonResponse<AuthResponse>(verifyRes);
      if (!verifyRes.ok || !verifyData.success) {
        throw new Error(verifyData?.error || 'Biometric validation rejected.');
      }

      if (!verifyData.sessionToken || !verifyData.admin) throw new Error('Biometric verification response was incomplete.');
      localStorage.setItem('unipay_token', verifyData.sessionToken);
      onAuthenticated(verifyData.admin, false);

    } catch (err: unknown) {
      console.error('Biometric Login Error:', err);
      setError(err instanceof Error ? err.message : 'Biometric login aborted.');
      setStatusText('Secure Enclave Gate');
    } finally {
      setLoading(false);
    }
  };

  const modalBgStyle = ASSET_CONFIG.modalBackground
    ? { backgroundImage: `linear-gradient(rgba(7, 8, 11, 0.80), rgba(7, 8, 11, 0.90)), url('${ASSET_CONFIG.modalBackground}')` }
    : { backgroundColor: '#07080B' };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 font-mono bg-cover bg-center bg-no-repeat"
      style={modalBgStyle}
    >
      <motion.div
        initial={false}
        animate={{ scale: 1, opacity: 1 }}
        className="w-full max-w-md bg-[#12141C]/95 backdrop-blur-md border border-[#FFB000]/40 p-6 space-y-5 shadow-[0_0_40px_rgba(255,176,0,0.2)] relative overflow-hidden"
      >
        <div className="absolute -right-10 -top-10 w-32 h-32 bg-[#FFB000]/10 rounded-full blur-2xl pointer-events-none" />

        {/* Header Branding & Splash Banner Integration */}
        <div className="space-y-3 border-b border-[#FFB000]/20 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Fingerprint className="w-5 h-5 text-[#FFB000] animate-pulse" />
              <span className="text-xs font-bold tracking-[0.2em] text-[#FFB000]">UNIPAY // SECURE ENCLAVE</span>
            </div>
            <span className="text-[9px] text-[#FFB000]/60 tracking-widest uppercase">DEFCON-2</span>
          </div>

          {/* Integrated Splash / Banner Preview Image */}
          {ASSET_CONFIG.splashBannerImage && (
            <div className="relative w-full h-28 rounded border border-[#FFB000]/30 overflow-hidden bg-black/50">
              <div
                className="absolute inset-0 bg-cover bg-center opacity-75 hover:opacity-100 transition duration-300"
                style={{ backgroundImage: `url('${ASSET_CONFIG.splashBannerImage}')` }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#12141C] via-transparent to-transparent" />
              <div className="absolute bottom-2 left-3 right-3 flex items-center justify-between text-[10px] tracking-widest text-[#FFB000] font-bold">
                <span>SYSTEM GATEWAY</span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
              </div>
            </div>
          )}
        </div>

        <form onSubmit={handlePasswordLogin} className="space-y-4">
          <div className="space-y-1">
            <label className="text-[10px] text-[#FFB000]/60 tracking-wider uppercase flex items-center gap-1">
              <User className="w-3 h-3" /> Operator ID or Email
            </label>
            <input
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              className="w-full bg-[#07080B] border border-[#FFB000]/30 p-2.5 text-xs text-[#FFB000] focus:outline-none focus:border-[#FFB000]"
              required
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] text-[#FFB000]/60 tracking-wider uppercase flex items-center gap-1">
              <Lock className="w-3 h-3" /> Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full bg-[#07080B] border border-[#FFB000]/30 p-2.5 text-xs text-[#FFB000] focus:outline-none focus:border-[#FFB000]"
            />
          </div>

          {error && (
            <div className="p-2.5 bg-red-950/40 border border-red-500/40 text-red-400 text-[10px] flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="text-[10px] text-amber-400/80 text-center uppercase tracking-wider py-1 font-semibold">
            {statusText}
          </div>

          <div className="space-y-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#FFB000] text-black font-bold p-3 text-xs tracking-wider uppercase hover:bg-amber-400 transition flex items-center justify-center space-x-2 disabled:opacity-50 cursor-pointer shadow-md"
            >
              <KeyRound className="w-4 h-4" />
              <span>{loading ? 'Processing...' : 'Login with Password'}</span>
            </button>

            <button
              type="button"
              onClick={handleBiometricLogin}
              disabled={loading}
              className="w-full bg-transparent border border-[#FFB000]/40 text-[#FFB000] font-bold p-2.5 text-xs tracking-wider uppercase hover:bg-[#FFB000]/10 transition flex items-center justify-center space-x-2 disabled:opacity-50 cursor-pointer"
            >
              <Fingerprint className="w-4 h-4 text-[#FFB000]" />
              <span>Quick Biometric Sign-In</span>
            </button>
          </div>
        </form>

        <div className="text-[9px] text-[#FFB000]/40 text-center tracking-widest uppercase border-t border-[#FFB000]/10 pt-3">
          Hardware Enclave Verified // UniPay OS
        </div>
      </motion.div>
    </div>
  );
}