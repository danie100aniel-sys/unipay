'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { CheckCircle, XCircle, RefreshCw, ShieldAlert } from 'lucide-react';
import { adminFetch } from '../../../lib/adminApi';

interface ReviewOrder { order_id: string; amount_usd: number | string; client_ip?: string; created_at: string; risk_score?: number | string }

export function QueueTab() {
  const [queuedOrders, setQueuedOrders] = useState<ReviewOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState<string | null>(null);

  const fetchQueue = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminFetch<{ success: boolean; queue: ReviewOrder[] }>('/review/queue');
      if (res.success) {
        setQueuedOrders(res.queue || []);
      }
    } catch (e) {
      console.error('Failed to fetch review queue', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialTimer = setTimeout(() => { void fetchQueue(); }, 0);
    // Live poll the queue every 15 seconds
    const interval = setInterval(() => { void fetchQueue(); }, 15000);
    return () => { clearTimeout(initialTimer); clearInterval(interval); };
  }, [fetchQueue]);

  const handleAction = async (orderId: string, resolution: 'APPROVED' | 'REJECTED') => {
    if (!confirm(`Are you sure you want to ${resolution === 'APPROVED' ? 'complete' : 'reject'} this transaction?`)) return;

    setActioning(orderId);
    try {
      const res = await adminFetch(`/review/${orderId}/resolve`, {
        method: 'POST',
        body: JSON.stringify({ resolution }),
      });
      if (res.success) {
        // Remove item locally for immediate UI update
        setQueuedOrders(prev => prev.filter(o => o.order_id !== orderId));
      } else {
        alert(res.message || 'Review action failed');
      }
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setActioning(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-[#12141C]/90 border border-red-500/40 p-4 space-y-3">
        <div className="flex items-center justify-between border-b border-red-500/20 pb-2">
          <div className="flex items-center space-x-2 text-red-500">
            <ShieldAlert className="w-4 h-4" />
            <span className="text-xs font-bold tracking-widest uppercase">Manual Review Queue</span>
          </div>
          <button onClick={fetchQueue} className="text-[10px] text-red-400 hover:text-red-300 flex items-center gap-1 cursor-pointer">
            <RefreshCw className="w-3 h-3" /> Refresh
          </button>
        </div>

        {loading && queuedOrders.length === 0 ? (
          <div className="text-center py-8 text-[10px] text-red-500/50 uppercase tracking-widest">Scanning Queue...</div>
        ) : queuedOrders.length === 0 ? (
          <div className="text-center py-8 text-[10px] text-emerald-500/70 uppercase tracking-widest">Queue is clear. No pending reviews.</div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {queuedOrders.map((order) => (
              <div key={order.order_id} className="p-3 border border-red-500/20 bg-red-950/10 text-xs space-y-2">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-bold text-red-400">ORDER: {order.order_id.split('-')[0]}</p>
                    <p className="text-[10px] text-red-500/60 mt-0.5">Amount: ${order.amount_usd} | IP: {order.client_ip}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-red-400/80">{new Date(order.created_at).toLocaleString()}</p>
                    <p className="text-[10px] font-mono mt-1 text-red-300">RISK SCORE: {order.risk_score || 'N/A'}</p>
                  </div>
                </div>

                <div className="flex gap-2 pt-2 border-t border-red-500/10">
                  <button
                    onClick={() => handleAction(order.order_id, 'APPROVED')}
                    disabled={actioning === order.order_id}
                    className="flex-1 py-1.5 flex justify-center items-center gap-1 bg-emerald-950/50 border border-emerald-500/30 text-emerald-400 text-[10px] uppercase font-bold hover:bg-emerald-900 transition cursor-pointer disabled:opacity-50"
                  >
                    <CheckCircle className="w-3 h-3" /> {actioning === order.order_id ? '...' : 'Complete'}
                  </button>
                  <button
                    onClick={() => handleAction(order.order_id, 'REJECTED')}
                    disabled={actioning === order.order_id}
                    className="flex-1 py-1.5 flex justify-center items-center gap-1 bg-red-950/50 border border-red-500/30 text-red-400 text-[10px] uppercase font-bold hover:bg-red-900 transition cursor-pointer disabled:opacity-50"
                  >
                    <XCircle className="w-3 h-3" /> {actioning === order.order_id ? '...' : 'Reject'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}