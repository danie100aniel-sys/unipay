'use client';

import React, { useState } from 'react';
import { startRegistration } from '@simplewebauthn/browser';
import { readJsonResponse } from '@/app/lib/api';
import { ShieldAlert, Fingerprint, Clock } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

interface BiometricPromptProps {
  username: string;
  onEnrolled: () => void;
  onDismiss: () => void;
}

interface RegistrationResponse {
  success: boolean;
  error?: string;
  options?: Parameters<typeof startRegistration>[0]['optionsJSON'];
}

export function BiometricEnrollmentPrompt({ username, onEnrolled, onDismiss }: BiometricPromptProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleEnroll = async () => {
    if (!window.isSecureContext) {
      setError('Passkey enrollment requires HTTPS. Continue with password sign-in and try again from the secure admin site.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const regRes = await fetch(`${API_BASE}/api/auth/register-challenge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('unipay_token') || ''}`,
        },
        body: JSON.stringify({ username }),
      });
      const regData = await readJsonResponse<RegistrationResponse>(regRes);
      if (!regRes.ok || !regData.success) {
        throw new Error(regData?.error || 'Failed to initialize biometric enrollment handshake.');
      }

      if (!regData.options) throw new Error('Passkey enrollment options were missing.');
      const attestationResponse = await startRegistration({ optionsJSON: regData.options });

      const verifyRes = await fetch(`${API_BASE}/api/auth/register-verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('unipay_token') || ''}`,
        },
        body: JSON.stringify({ username, credential: attestationResponse }),
      });
      const verifyData = await readJsonResponse<{ success: boolean; error?: string }>(verifyRes);
      if (!verifyRes.ok || !verifyData.success) {
        throw new Error(verifyData?.error || 'Hardware passkey verification rejected.');
      }

      onEnrolled();
    } catch (err: unknown) {
      console.error('Enrollment Error:', err);
      setError(err instanceof Error ? err.message : 'Passkey enrollment sequence aborted.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-[#07080B]/90 backdrop-blur-sm z-50 flex items-center justify-center p-4 font-mono">
      <div className="w-full max-w-md bg-[#12141C] border border-[#FFB000]/40 p-6 space-y-5 shadow-[0_0_30px_rgba(255,176,0,0.15)]">
        <div className="flex items-center space-x-2 border-b border-[#FFB000]/20 pb-3">
          <Fingerprint className="w-6 h-6 text-[#FFB000] animate-pulse" />
          <span className="text-xs font-bold tracking-[0.2em] text-[#FFB000]">SECURITY ENCLAVE MANDATE</span>
        </div>

        <div className="space-y-2 text-xs text-[#FFB000]/80 leading-relaxed">
          <p>
            Operator protocols require linking a local hardware passkey (TouchID, FaceID, or Windows Hello) for faster, highly secure access.
          </p>
          <p className="text-[10px] text-[#FFB000]/60">
            You can link it now or choose to defer this action. Your account will continue to function via password authentication.
          </p>
        </div>

        {error && (
          <div className="p-2.5 bg-red-950/40 border border-red-500/40 text-red-400 text-[10px] flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-2 pt-2">
          <button
            onClick={handleEnroll}
            disabled={loading}
            className="w-full bg-[#FFB000] text-black font-bold p-3 text-xs tracking-wider uppercase hover:bg-amber-400 transition flex items-center justify-center space-x-2 disabled:opacity-50"
          >
            <Fingerprint className="w-4 h-4" />
            <span>{loading ? 'Interfacing with Hardware...' : 'Register Hardware Biometrics'}</span>
          </button>

          <button
            onClick={onDismiss}
            disabled={loading}
            className="w-full bg-transparent border border-[#FFB000]/30 text-[#FFB000] font-bold p-2.5 text-xs tracking-wider uppercase hover:bg-[#FFB000]/10 transition flex items-center justify-center space-x-2"
          >
            <Clock className="w-4 h-4" />
            <span>Remind Me Later</span>
          </button>
        </div>

        <div className="text-[9px] text-[#FFB000]/40 text-center tracking-widest uppercase">
          DEFCON-2 Compliance Protocol
        </div>
      </div>
    </div>
  );
}