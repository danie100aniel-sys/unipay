'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Layers, CheckCircle2, AlertCircle, Clock, RefreshCw } from 'lucide-react';
import { adminFetch } from '../../../lib/adminApi';

interface OrderRow {
  order_id: string;
  site_name?: string;
  site_id: string;
  amount_usd: number | string;
  client_ip?: string;
  region?: string;
  status: string;
}

export function OrdersTab() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const url = statusFilter ? `/orders?status=${statusFilter}` : '/orders';
      const data = await adminFetch<{ success: boolean; orders: OrderRow[] }>(url);
      if (data.success) {
        setOrders(data.orders);
      }
    } catch (e) {
      console.error('Failed to load orders', e);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    const timer = setTimeout(() => { void fetchOrders(); }, 0);
    return () => clearTimeout(timer);
  }, [fetchOrders]);

  return (
    <div className="space-y-4">
      <div className="bg-[#12141C]/90 border border-[#FFB000]/30 p-4 sm:p-5 space-y-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-[#FFB000]/20 pb-2.5 gap-2">
          <div className="flex items-center space-x-2">
            <Layers className="w-4 h-4 text-[#FFB000]" />
            <span className="text-xs font-bold tracking-widest uppercase">ORDERS LEDGER</span>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <select 
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-black/60 border border-[#FFB000]/30 text-[10px] text-[#FFB000] p-1 uppercase tracking-wider outline-none"
            >
              <option value="">All Statuses</option>
              <option value="COMPLETED">Completed</option>
              <option value="PENDING">Pending</option>
              <option value="FAILED">Failed</option>
            </select>
            <button 
              onClick={fetchOrders}
              className="p-1 bg-[#FFB000]/10 border border-[#FFB000]/30 hover:bg-[#FFB000]/20 text-[#FFB000] transition cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
          {loading ? (
            <div className="text-center py-12 text-xs text-[#FFB000]/40 uppercase tracking-widest">Querying orders ledger...</div>
          ) : orders.length === 0 ? (
            <div className="text-center py-12 text-xs text-[#FFB000]/40 uppercase tracking-widest">No matching orders found</div>
          ) : (
            orders.map((order) => (
              <div key={order.order_id} className="p-3 bg-black/40 border border-[#FFB000]/10 text-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                <div className="space-y-1">
                  <div className="font-bold font-mono">#{order.order_id} <span>{'//'}</span> <span className="text-[#FFB000]/70">{order.site_name || order.site_id}</span></div>
                  <div className="text-[10px] text-[#FFB000]/60">
                    Amount: <strong className="text-[#FFB000]">${order.amount_usd}</strong> | IP: {order.client_ip || 'N/A'} | Region: {order.region || 'Global'}
                  </div>
                </div>
                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <span className={`text-[9px] px-2 py-0.5 border font-bold flex items-center gap-1 ${
                    order.status === 'COMPLETED' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' :
                    order.status === 'PENDING' ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' :
                    'bg-rose-500/10 border-rose-500/30 text-rose-400'
                  }`}>
                    {order.status === 'COMPLETED' && <CheckCircle2 className="w-3 h-3" />}
                    {order.status === 'PENDING' && <Clock className="w-3 h-3" />}
                    {order.status === 'FAILED' && <AlertCircle className="w-3 h-3" />}
                    {order.status}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}