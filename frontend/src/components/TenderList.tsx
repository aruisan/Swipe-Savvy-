'use client';

import { useState } from 'react';
import { generateIdempotencyKey, ledgerApi } from '@/lib/api';
import { dollarsToCents, formatCents } from '@/lib/currency';
import { OrderLedger, PaymentItem } from '@/types/ledger';

interface TenderListProps {
  order: OrderLedger;
  onUpdated: (updated: OrderLedger) => void;
  onNotify: (type: 'success' | 'error', text: string) => void;
}

export function TenderList({ order, onUpdated, onNotify }: TenderListProps) {
  const [activeRefundPaymentId, setActiveRefundPaymentId] = useState<string | null>(null);
  const [refundDollars, setRefundDollars] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const openRefundForm = (payment: PaymentItem) => {
    setActiveRefundPaymentId(payment.id);
    setRefundDollars((payment.refundableCents / 100).toFixed(2));
    setReason('');
  };

  const handleRefundSubmit = async (e: React.FormEvent, paymentId: string) => {
    e.preventDefault();
    const amountCents = dollarsToCents(refundDollars);
    if (amountCents <= 0) {
      onNotify('error', 'Refund amount must be greater than $0.00');
      return;
    }

    const key = generateIdempotencyKey('ref');
    setSubmitting(true);
    try {
      const updated = await ledgerApi.applyRefund(
        order.id,
        {
          paymentId,
          amountCents,
          reason: reason.trim() || undefined,
        },
        key,
      );
      setActiveRefundPaymentId(null);
      setRefundDollars('');
      setReason('');
      onUpdated(updated);
      onNotify('success', `Refunded ${formatCents(amountCents)} on selected tender`);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Refund failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-base font-bold text-slate-900">
        Applied Tenders & Refunds ({order.payments.length})
      </h2>

      {order.payments.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-slate-200 py-8 text-center text-sm text-slate-500">
          No payments applied to this order yet.
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          {order.payments.map((payment) => (
            <div
              key={payment.id}
              className="rounded-lg border border-slate-200 bg-slate-50/60 p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span
                    className={`rounded-md px-2.5 py-1 text-xs font-bold ${
                      payment.method === 'CARD'
                        ? 'bg-violet-100 text-violet-800'
                        : 'bg-teal-100 text-teal-800'
                    }`}
                  >
                    {payment.method}
                  </span>
                  <span className="text-base font-bold text-slate-900">
                    {formatCents(payment.amountCents)}
                  </span>
                  <span className="font-mono text-xs text-slate-400">
                    ({payment.id.slice(0, 8)}...)
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-600">
                    Refundable:{' '}
                    <strong className="text-slate-900">
                      {formatCents(payment.refundableCents)}
                    </strong>
                  </span>

                  {payment.refundableCents > 0 && (
                    <button
                      type="button"
                      onClick={() => openRefundForm(payment)}
                      className="rounded-md border border-rose-300 bg-white px-2.5 py-1 text-xs font-semibold text-rose-700 transition hover:bg-rose-50"
                    >
                      Refund Tender
                    </button>
                  )}
                </div>
              </div>

              {payment.refunds.length > 0 && (
                <div className="mt-3 space-y-1.5 border-t border-slate-200/80 pt-2.5">
                  {payment.refunds.map((refund) => (
                    <div
                      key={refund.id}
                      className="flex items-center justify-between text-xs text-rose-700"
                    >
                      <span>
                        ↳ Refund: <strong>-{formatCents(refund.amountCents)}</strong>
                        {refund.reason ? ` — "${refund.reason}"` : ''}
                      </span>
                      <span className="font-mono text-[11px] text-slate-400">
                        {new Date(refund.createdAt).toLocaleTimeString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {activeRefundPaymentId === payment.id && (
                <form
                  onSubmit={(e) => handleRefundSubmit(e, payment.id)}
                  className="mt-3 rounded-lg border border-rose-200 bg-white p-3.5"
                >
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600">
                        Refund Amount (Max {formatCents(payment.refundableCents)})
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        max={(payment.refundableCents / 100).toFixed(2)}
                        value={refundDollars}
                        onChange={(e) => setRefundDollars(e.target.value)}
                        required
                        className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600">
                        Reason (optional)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Partial item return"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm text-slate-900"
                      />
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      type="submit"
                      disabled={submitting}
                      className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                    >
                      {submitting ? 'Refunding...' : 'Confirm Refund'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveRefundPaymentId(null)}
                      className="rounded-md px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}