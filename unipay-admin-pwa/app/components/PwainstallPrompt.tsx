'use client';

import React, { useState, useEffect } from 'react';
import { Download, ShieldCheck, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PwainstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // 1. Register Service Worker on mount
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then((reg) => console.log('Service Worker registered successfully:', reg.scope))
        .catch((err) => console.error('Service Worker registration failed:', err));
    }

    // 2. Listen for the browser's native install prompt trigger
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setVisible(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      console.log('User accepted the PWA install prompt');
    }
    setDeferredPrompt(null);
    setVisible(false);
  };

  return (
    <>
      {/* Required PWA head tags rendered dynamically */}
      <link rel="manifest" href="/manifest.json" />
      <meta name="theme-color" content="#FFB000" />

      {/* Dark Tactical Install Modal */}
      {visible && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#12141C] border border-[#FFB000]/40 w-full max-w-md p-6 rounded shadow-2xl space-y-4 relative animate-in fade-in zoom-in-95 duration-200">
            <button 
              onClick={() => setVisible(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-[#FFB000] cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="p-3 bg-[#FFB000]/10 border border-[#FFB000]/30 rounded text-[#FFB000]">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-bold tracking-widest text-[#FFB000] uppercase">Install Admin Control PWA</h3>
                <p className="text-xs text-gray-400">Deploy as a standalone desktop/mobile application.</p>
              </div>
            </div>

            <div className="bg-black/60 border border-[#FFB000]/20 p-3 rounded text-[11px] font-mono text-gray-300 space-y-1">
              <p className="text-[#FFB000] uppercase tracking-wider font-bold">System Requirements Met:</p>
              <p>• Service Worker Active</p>
              <p>• Encrypted Ledger Sync Ready</p>
              <p>• Real-time SSE Feed Enabled</p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button 
                onClick={() => setVisible(false)}
                className="px-4 py-2 text-xs font-mono text-gray-400 hover:text-white uppercase cursor-pointer"
              >
                Dismiss
              </button>
              <button 
                onClick={handleInstallClick}
                className="bg-[#FFB000] text-black font-bold px-5 py-2 text-xs uppercase tracking-wider rounded cursor-pointer hover:bg-[#FFB000]/90 flex items-center gap-2 shadow-[0_0_15px_rgba(255,176,0,0.3)]"
              >
                <Download className="w-4 h-4" /> Install Application
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}