'use client';

import React, { useState, useEffect } from 'react';
import { Send, Radio } from 'lucide-react';
import { adminFetch } from '@/app/lib/adminApi';

interface ChatAdmin { username: string; role: string }
interface ChatMessage { message_id: string; sender_name: string; message: string; is_broadcast: boolean; created_at: string }

export function TacticalChat({ admin }: { admin: ChatAdmin }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isBroadcast, setIsBroadcast] = useState(false);

  const fetchMessages = async () => {
    try {
      const data = await adminFetch<{ success: boolean; messages: ChatMessage[] }>('/chat');
      if (data.success) setMessages(data.messages);
    } catch (e) {
      console.error('Failed to sync comms feed', e);
    }
  };

  useEffect(() => {
    const initialTimer = setTimeout(() => { void fetchMessages(); }, 0);
    const interval = setInterval(() => { void fetchMessages(); }, 3000); // Polling telemetry sync
    return () => { clearTimeout(initialTimer); clearInterval(interval); };
  }, []);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    try {
      await adminFetch('/chat', {
        method: 'POST',
        body: JSON.stringify({
          message: input,
          is_broadcast: isBroadcast && admin.role === 'superadmin'
        }),
      });
      setInput('');
      fetchMessages();
    } catch (e) {
      console.error('Transmission failed', e);
    }
  };

  return (
    <div className="bg-[#12141C] border border-[#FFB000]/30 p-4 space-y-4 font-mono text-xs">
      <div className="flex justify-between items-center border-b border-[#FFB000]/20 pb-2">
        <div className="flex items-center space-x-2">
          <Radio className="w-4 h-4 text-[#FFB000] animate-pulse" />
          <span className="font-bold tracking-widest text-[#FFB000]">SECURE_OPERATOR_COMMS</span>
        </div>
        <span className="text-[9px] px-1.5 py-0.5 bg-[#07080B] border border-[#FFB000]/20 text-[#FFB000]/70">
          NODE // {admin?.username}
        </span>
      </div>

      {/* Message Feed Display */}
      <div className="h-64 overflow-y-auto space-y-2 pr-1 border border-[#FFB000]/15 p-2 bg-[#07080B]">
        {messages.map((m) => (
          <div
            key={m.message_id}
            className={`p-2 border ${m.is_broadcast ? 'bg-red-950/30 border-red-500/40 text-red-300' : 'bg-[#12141C] border-[#FFB000]/20 text-[#FFB000]/90'}`}
          >
            <div className="flex justify-between text-[9px] opacity-60 pb-1">
              <span className="font-bold">{m.sender_name} {m.is_broadcast && '[GLOBAL BROADCAST]'}</span>
              <span>{new Date(m.created_at).toLocaleTimeString()}</span>
            </div>
            <p className="text-xs leading-relaxed">{m.message}</p>
          </div>
        ))}
      </div>

      {/* Message Input Form */}
      <form onSubmit={sendMessage} className="space-y-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Transmit secure operator note..."
          className="w-full bg-[#07080B] border border-[#FFB000]/30 p-2 text-xs text-[#FFB000] focus:outline-none focus:border-[#FFB000] h-16 resize-none"
          required
        />

        <div className="flex justify-between items-center">
          {admin?.role === 'superadmin' ? (
            <label className="flex items-center space-x-2 text-[10px] cursor-pointer text-amber-400">
              <input
                type="checkbox"
                checked={isBroadcast}
                onChange={(e) => setIsBroadcast(e.target.checked)}
                className="accent-[#FFB000]"
              />
              <span>Broadcast Override (All Nodes)</span>
            </label>
          ) : <div />}

          <button
            type="submit"
            className="bg-[#FFB000] text-black font-bold px-4 py-2 text-xs tracking-wider uppercase hover:bg-amber-400 transition flex items-center space-x-1.5"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Transmit</span>
          </button>
        </div>
      </form>
    </div>
  );
}