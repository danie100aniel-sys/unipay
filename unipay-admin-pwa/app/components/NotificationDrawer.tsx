'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCheck, BellRing } from 'lucide-react';

interface NotificationItem {
  id: number;
  type: string;
  text: string;
  time: string;
  unread: boolean;
}

interface NotificationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: NotificationItem[];
  onClearUnread: () => void;
}

export function NotificationDrawer({
  isOpen,
  onClose,
  notifications,
  onClearUnread,
}: NotificationDrawerProps) {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-x-0 top-0 bottom-16 z-50 flex items-start justify-center p-2 sm:p-4 pointer-events-none">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/80 backdrop-blur-xs pointer-events-auto"
        />

        {/* Sheet / Modal Container (Drop down from top, leaving bottom nav clean) */}
        <motion.div
          initial={{ opacity: 0, y: '-100%' }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: '-100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="relative w-full sm:max-w-md bg-[#12141C] border-b sm:border border-[#FFB000]/40 shadow-[0_0_50px_rgba(255,176,0,0.15)] rounded-b-2xl sm:rounded-lg max-h-[80vh] flex flex-col font-mono text-[#FFB000] z-10 overflow-hidden pointer-events-auto"
        >
          {/* Header */}
          <div className="p-4 border-b border-[#FFB000]/20 flex items-center justify-between bg-black/40">
            <div className="flex items-center space-x-2">
              <BellRing className="w-4 h-4 text-[#FFB000]" />
              <span className="text-xs font-bold tracking-widest uppercase">Live Telemetry Feed</span>
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={onClearUnread}
                className="flex items-center space-x-1 text-[10px] text-[#FFB000]/70 hover:text-[#FFB000] uppercase tracking-wider bg-[#FFB000]/10 px-2 py-1 border border-[#FFB000]/20 transition cursor-pointer"
              >
                <CheckCheck className="w-3 h-3" />
                <span>Mark Read</span>
              </button>
              <button
                onClick={onClose}
                className="p-1 text-[#FFB000]/70 hover:text-[#FFB000] transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* List Content */}
          <div className="p-4 space-y-2.5 overflow-y-auto flex-1 overscroll-contain">
            {notifications.length === 0 ? (
              <div className="text-xs text-[#FFB000]/40 text-center py-12 uppercase tracking-widest">
                No telemetry alerts recorded
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={`p-3 border text-xs space-y-1.5 transition ${
                    n.unread
                      ? 'bg-[#FFB000]/10 border-[#FFB000]/40 shadow-[inset_0_0_10px_rgba(255,176,0,0.05)]'
                      : 'bg-black/40 border-[#FFB000]/10 opacity-70'
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] text-[#FFB000]/60">
                    <span className="font-bold tracking-wider px-1.5 py-0.5 bg-black/60 border border-[#FFB000]/20">
                      {n.type}
                    </span>
                    <span>{n.time}</span>
                  </div>
                  <p className="text-[#FFB000]/90 text-xs leading-relaxed break-words">{n.text}</p>
                </div>
              ))
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}