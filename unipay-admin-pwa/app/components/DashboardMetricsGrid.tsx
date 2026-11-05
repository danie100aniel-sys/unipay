'use client';

import React from 'react';

export function DashboardMetricsGrid() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      <div className="bg-[#12141C]/90 border border-[#FFB000]/30 p-3.5 space-y-1">
        <span className="text-[9px] sm:text-[10px] text-[#FFB000]/60 uppercase tracking-wider">Node Volume</span>
        <div className="text-base sm:text-lg font-bold">$14,280</div>
      </div>
      <div className="bg-[#12141C]/90 border border-[#FFB000]/30 p-3.5 space-y-1">
        <span className="text-[9px] sm:text-[10px] text-[#FFB000]/60 uppercase tracking-wider">Active Queue</span>
        <div className="text-base sm:text-lg font-bold">3 PEND</div>
      </div>
      <div className="col-span-2 sm:col-span-1 bg-[#12141C]/90 border border-[#FFB000]/30 p-3.5 space-y-1">
        <span className="text-[9px] sm:text-[10px] text-[#FFB000]/60 uppercase tracking-wider">Enclave Status</span>
        <div className="text-xs font-bold text-emerald-400 flex items-center gap-1.5 pt-0.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> SECURE
        </div>
      </div>
    </div>
  );
}