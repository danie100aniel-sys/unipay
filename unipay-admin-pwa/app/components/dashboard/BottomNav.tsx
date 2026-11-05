'use client';

import React from 'react';
import { LayoutGrid, Layers, AlertCircle, Radio, Cpu } from 'lucide-react';

type TabType = 'feed' | 'orders' | 'queue' | 'comms' | 'system';

interface BottomNavProps {
  activeTab: TabType;
  onChangeTab: (tab: TabType) => void;
}

export function BottomNav({ activeTab, onChangeTab }: BottomNavProps) {
  return (
    <nav aria-label="Main Navigation" className="fixed bottom-0 left-0 right-0 bg-[#12141C]/98 backdrop-blur-md border-t border-[#FFB000]/20 p-2 sm:p-3 flex justify-around items-center max-w-md mx-auto z-40 shadow-2xl">
      <button 
        onClick={() => onChangeTab('feed')}
        className={`flex flex-col items-center text-[9px] sm:text-[10px] tracking-wider uppercase space-y-1 p-1 transition cursor-pointer ${activeTab === 'feed' ? 'text-[#FFB000] scale-105 font-bold' : 'text-[#FFB000]/50 hover:text-[#FFB000]'}`}
      >
        <LayoutGrid className="w-4 h-4" />
        <span>Feed</span>
      </button>
      <button 
        onClick={() => onChangeTab('orders')}
        className={`flex flex-col items-center text-[9px] sm:text-[10px] tracking-wider uppercase space-y-1 p-1 transition cursor-pointer ${activeTab === 'orders' ? 'text-[#FFB000] scale-105 font-bold' : 'text-[#FFB000]/50 hover:text-[#FFB000]'}`}
      >
        <Layers className="w-4 h-4" />
        <span>Orders</span>
      </button>
      <button 
        onClick={() => onChangeTab('queue')}
        className={`flex flex-col items-center text-[9px] sm:text-[10px] tracking-wider uppercase space-y-1 p-1 transition cursor-pointer ${activeTab === 'queue' ? 'text-[#FFB000] scale-105 font-bold' : 'text-[#FFB000]/50 hover:text-[#FFB000]'}`}
      >
        <AlertCircle className="w-4 h-4" />
        <span>Queue</span>
      </button>
      <button 
        onClick={() => onChangeTab('comms')}
        className={`flex flex-col items-center text-[9px] sm:text-[10px] tracking-wider uppercase space-y-1 p-1 transition cursor-pointer ${activeTab === 'comms' ? 'text-[#FFB000] scale-105 font-bold' : 'text-[#FFB000]/50 hover:text-[#FFB000]'}`}
      >
        <Radio className="w-4 h-4" />
        <span>Comms</span>
      </button>
      <button 
        onClick={() => onChangeTab('system')}
        className={`flex flex-col items-center text-[9px] sm:text-[10px] tracking-wider uppercase space-y-1 p-1 transition cursor-pointer ${activeTab === 'system' ? 'text-[#FFB000] scale-105 font-bold' : 'text-[#FFB000]/50 hover:text-[#FFB000]'}`}
      >
        <Cpu className="w-4 h-4" />
        <span>System</span>
      </button>
    </nav>
  );
}