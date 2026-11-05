'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Shield, Activity, RefreshCw } from 'lucide-react';
import { adminFetch } from '../../../lib/adminApi';

interface FeedTabProps {
  liveActivities: Array<{ type: string; description: string; timestamp: string }>;
}

interface DbActivity { id: string; activity_id?: string; type?: string; action_type: string; description: string; username?: string; timestamp?: string; created_at: string }

export function FeedTab({ liveActivities }: FeedTabProps) {
  const [dbActivities, setDbActivities] = useState<DbActivity[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchActivities = useCallback(async () => {
    try {
      const data = await adminFetch<{ success: boolean; activities: DbActivity[] }>('/activities?limit=25');
      if (data.success) {
        setDbActivities(data.activities);
      }
    } catch (e) {
      console.error('Failed to fetch activity logs', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => { void fetchActivities(); }, 0);
    return () => clearTimeout(timer);
  }, [liveActivities, fetchActivities]); // Refresh when new SSE events arrive

  return (
    <div className="space-y-4">
      <div className="bg-[#12141C]/90 border border-[#FFB000]/30 p-4 sm:p-5 space-y-2">
        <div className="flex items-center justify-between border-b border-[#FFB000]/20 pb-2.5">
          <div className="flex items-center space-x-2">
            <Shield className="w-4 h-4 text-[#FFB000]" />
            <span className="text-xs font-bold tracking-widest uppercase">TACTICAL STREAM ACTIVE</span>
          </div>
          <button 
            onClick={fetchActivities}
            className="text-[10px] text-[#FFB000]/70 hover:text-[#FFB000] flex items-center gap-1 cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" /> Sync
          </button>
        </div>
        <p className="text-xs text-[#FFB000]/80 leading-relaxed">
          Real-time EventSource telemetry bridge linked to <code className="text-[#FFB000]">/api/admin/stream</code>.
        </p>
      </div>

      <div className="bg-[#12141C]/90 border border-[#FFB000]/30 p-4 space-y-3">
        <div className="flex items-center space-x-2 border-b border-[#FFB000]/20 pb-2.5">
          <Activity className="w-4 h-4 text-[#FFB000]" />
          <span className="text-[10px] text-[#FFB000]/60 tracking-wider uppercase">Live Liveliness Feed & DB Logs</span>
        </div>

        <div className="space-y-2 text-xs max-h-[50vh] overflow-y-auto pr-1">
          {/* Live SSE stream items first */}
          {liveActivities.map((act, idx) => (
            <div key={`live-${idx}`} className="flex flex-col sm:flex-row sm:justify-between sm:items-center p-2.5 bg-[#FFB000]/10 border border-[#FFB000]/30 gap-1">
              <span className="text-[#FFB000] break-words"><strong className="text-emerald-400">⚡ [LIVE]</strong> [{act.type}] {act.description}</span>
              <span className="text-[9px] text-[#FFB000]/50 shrink-0">{act.timestamp}</span>
            </div>
          ))}

          {/* Historical DB Activity logs */}
          {loading ? (
            <div className="text-center py-6 text-xs text-[#FFB000]/40 uppercase tracking-widest">Loading database logs...</div>
          ) : (
            dbActivities.map((item) => (
              <div key={item.id} className="flex flex-col sm:flex-row sm:justify-between sm:items-center p-2.5 bg-black/40 border border-[#FFB000]/10 gap-1">
                <div className="space-y-0.5 break-words">
                  <span className="text-[#FFB000]/90"><strong>[{item.action_type}]</strong> {item.description}</span>
                  {item.username && <div className="text-[9px] text-[#FFB000]/50">Operator: {item.username}</div>}
                </div>
                <span className="text-[9px] text-[#FFB000]/50 shrink-0">
                  {new Date(item.created_at).toLocaleTimeString()}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}