'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Terminal } from 'lucide-react';

interface IdleSplashProps {
  splashImage: string;
  onResume: () => void;
}

export function IdleSplash({ splashImage, onResume }: IdleSplashProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onResume}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center p-6 bg-cover bg-center cursor-pointer"
      style={{ backgroundImage: `linear-gradient(rgba(7, 8, 11, 0.9), rgba(7, 8, 11, 0.95)), url('${splashImage}')` }}
    >
      <div className="max-w-sm w-full bg-[#12141C] border border-[#FFB000]/40 p-6 text-center space-y-3 shadow-2xl">
        <Terminal className="w-8 h-8 text-[#FFB000] mx-auto animate-pulse" />
        <h2 className="text-xs font-bold tracking-[0.25em]">NODE IDLE // SECURED</h2>
        <p className="text-[10px] text-[#FFB000]/60">TAP ANYWHERE TO RESUME SESSION</p>
      </div>
    </motion.div>
  );
}