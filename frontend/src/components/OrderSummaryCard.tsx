'use client';

import { formatCents } from '@/lib/currency';
import { OrderLedger, OrderStatus } from '@/types/ledger';

const STATUS_STYLES: Record<OrderStatus, string> = {
  PENDING: 'bg-amber-100 text-amber-800 border-amber-300',
  PARTIALLY_PAID: 'bg-blue-100 text-blue-800 border-blue-300',
  PAID: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  REFUNDED: 'bg-slate-200 text-slate-800 border-slate-300',
};

export function OrderSummaryCard({ order }: { order: OrderLedger }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
            Order Ledger ID
          </p>
          <p className="font-mono text-sm font-semibold text-slate-800">{order.id}</p>
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-xs font-bold ${STATUS_STYLES[order.status]}`}
        >
          {order.status.replace('_', ' ')}
        </span>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg bg-slate-50 p-3.5">
          <p className="text-xs text-slate-500">Order Total</p>
          <p className="mt-1 text-xl font-bold text-slate-900">
            {formatCents(order.totalCents)}
          </p>
          <p className="font-mono text-[11px] text-slate-400">{order.totalCents}¢</p>
        </div>

        <div className="rounded-lg bg-emerald-50/70 p-3.5">
          <p className="text-xs text-emerald-700">Net Paid</p>
          <p className="mt-1 text-xl font-bold text-emerald-800">
            {formatCents(order.netPaidCents)}
          </p>
          <p className="font-mono text-[11px] text-emerald-600/80">{order.netPaidCents}¢</p>
        </div>

        <div className="rounded-lg bg-rose-50/70 p-3.5">
          <p className="text-xs text-rose-700">Total Refunded</p>
          <p className="mt-1 text-xl font-bold text-rose-800">
            {formatCents(order.totalRefundedCents)}
          </p>
          <p className="font-mono text-[11px] text-rose-600/80">
            {order.totalRefundedCents}¢
          </p>
        </div>

        <div className="rounded-lg bg-indigo-50/70 p-3.5">
          <p className="text-xs text-indigo-700">Remaining Balance</p>
          <p className="mt-1 text-xl font-bold text-indigo-900">
            {formatCents(order.outstandingCents)}
          </p>
          <p className="font-mono text-[11px] text-indigo-600/80">
            {order.outstandingCents}¢
          </p>
        </div>
      </div>
    </div>
  );
}