'use client';

import React from 'react';
import { Lock, Bell } from 'lucide-react';

interface NotificationItem {
  id: number;
  type: string;
  text: string;
  time: string;
  unread: boolean;
}

interface NavbarProps {
  username: string;
  onLock: () => void;
  onOpenNotifications: () => void;
  notifications: NotificationItem[];
}

export function DashboardNavbar({ username, onLock, onOpenNotifications, notifications }: NavbarProps) {
  const unreadCount = notifications.filter(n => n.unread).length;

  return (
    <header className="sticky top-0 z-30 w-full bg-[#12141C]/95 backdrop-blur-md border-b border-[#FFB000]/20 px-4 py-3 flex items-center justify-between font-mono text-[#FFB000]">
      <div className="flex items-center space-x-2.5">
        <div className="relative flex items-center justify-center">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping absolute" />
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 relative" />
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] text-[#FFB000]/60 tracking-widest uppercase">NODE ACTIVE</span>
          <span className="text-xs font-bold tracking-wider">{username}</span>
        </div>
      </div>

      <div className="flex items-center space-x-2">
        {/* Notification Trigger Button */}
        <button
          onClick={onOpenNotifications}
          className="relative p-2.5 bg-[#FFB000]/10 hover:bg-[#FFB000]/20 border border-[#FFB000]/30 transition active:scale-95 cursor-pointer"
          aria-label="Open notifications"
        >
          <Bell className="w-4 h-4 text-[#FFB000]" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[16px] h-4 bg-red-500 text-black text-[9px] font-bold rounded-full flex items-center justify-center px-1 animate-pulse">
              {unreadCount}
            </span>
          )}
        </button>

        {/* Lock Session Button */}
        <button
          onClick={onLock}
          className="flex items-center space-x-1 bg-[#FFB000]/10 hover:bg-[#FFB000]/20 border border-[#FFB000]/30 px-3 py-2 text-xs font-bold tracking-wider uppercase transition active:scale-95 cursor-pointer"
        >
          <Lock className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">LOCK</span>
        </button>
      </div>
    </header>
  );
}