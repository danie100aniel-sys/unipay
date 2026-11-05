'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Radio, Send, Megaphone, RefreshCw } from 'lucide-react';
import { adminFetch } from '../../../lib/adminApi';

interface CommsTabProps {
  role?: string;
}

interface CommsMessage {
  id: string;
  sender_name: string;
  sender_username?: string;
  message: string;
  is_broadcast: boolean;
  created_at: string;
}

export function CommsTab({ role }: CommsTabProps) {
  const isSuperAdmin = role === 'superadmin';
  const [messages, setMessages] = useState<CommsMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [newMessage, setNewMessage] = useState('');
  const [isBroadcast, setIsBroadcast] = useState(false);
  const [sending, setSending] = useState(false);

  const fetchMessages = useCallback(async () => {
    try {
      const data = await adminFetch<{ success: boolean; messages: CommsMessage[] }>('/messages');
      if (data.success) {
        setMessages(data.messages);
      }
    } catch (e) {
      console.error('Failed to load messages', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialTimer = setTimeout(() => { void fetchMessages(); }, 0);
    const interval = setInterval(() => { void fetchMessages(); }, 5000);
    return () => { clearTimeout(initialTimer); clearInterval(interval); };
  }, [fetchMessages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    setSending(true);
    try {
      const data = await adminFetch('/messages', {
        method: 'POST',
        body: JSON.stringify({ message: newMessage, is_broadcast: isSuperAdmin && isBroadcast })
      });
      if (data.success) {
        setNewMessage('');
        setIsBroadcast(false);
        fetchMessages();
      } else {
        alert(data.message || 'Failed to dispatch message');
      }
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Error sending message');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-[#12141C]/90 border border-[#FFB000]/30 p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between border-b border-[#FFB000]/20 pb-2.5">
          <div className="flex items-center space-x-2">
            <Radio className="w-4 h-4 text-[#FFB000]" />
            <span className="text-xs font-bold tracking-widest uppercase">SECURE RELAY COMMS</span>
          </div>
          <button onClick={fetchMessages} className="text-[10px] text-[#FFB000]/70 hover:text-[#FFB000] flex items-center gap-1 cursor-pointer">
            <RefreshCw className="w-3 h-3" /> Sync
          </button>
        </div>

        <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
          {loading ? (
            <div className="text-center py-10 text-xs text-[#FFB000]/40 uppercase tracking-widest">Loading secure comms...</div>
          ) : messages.length === 0 ? (
            <div className="text-center py-10 text-xs text-[#FFB000]/40 uppercase tracking-widest">No active secure transmissions</div>
          ) : (
            messages.map((msg) => (
              <div 
                key={msg.id} 
                className={`p-3 border text-xs space-y-1 ${
                  msg.is_broadcast 
                    ? 'bg-amber-500/10 border-amber-500/40 text-amber-300' 
                    : 'bg-black/40 border-[#FFB000]/10 text-[#FFB000]/90'
                }`}
              >
                <div className="flex items-center justify-between text-[10px] opacity-60">
                  <span className="font-bold flex items-center gap-1">
                    {msg.is_broadcast && <Megaphone className="w-3 h-3 text-amber-400" />}
                    FROM: {msg.sender_username || 'SYSTEM'}
                  </span>
                  <span>{new Date(msg.created_at).toLocaleString()}</span>
                </div>
                <p className="break-words leading-relaxed">{msg.message}</p>
              </div>
            ))
          )}
        </div>

        <form onSubmit={handleSendMessage} className="pt-2 border-t border-[#FFB000]/20 space-y-2">
          <textarea
            rows={2}
            placeholder="Type secure transmission message..."
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            className="w-full bg-black/60 border border-[#FFB000]/30 text-xs text-[#FFB000] p-2.5 outline-none focus:border-[#FFB000] resize-none"
          />
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            {isSuperAdmin ? (
              <label className="flex items-center space-x-2 text-[10px] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isBroadcast}
                  onChange={(e) => setIsBroadcast(e.target.checked)}
                  className="accent-[#FFB000]"
                />
                <span className="text-[#FFB000]/80">Dispatch as Global Broadcast (Superadmin)</span>
              </label>
            ) : <div />}
            <button
              type="submit"
              disabled={sending || !newMessage.trim()}
              className="px-4 py-2 bg-[#FFB000] text-black text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" /> Transmit
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}