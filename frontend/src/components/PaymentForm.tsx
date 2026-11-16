'use client';

import { useState } from 'react';
import { generateIdempotencyKey, ledgerApi } from '@/lib/api';
import { dollarsToCents, formatCents } from '@/lib/currency';
import { OrderLedger, TenderMethod } from '@/types/ledger';

interface PaymentFormProps {
  order: OrderLedger;
  onUpdated: (updated: OrderLedger) => void;
  onNotify: (type: 'success' | 'error', text: string) => void;
}

export function PaymentForm({ order, onUpdated, onNotify }: PaymentFormProps) {
  const [amountDollars, setAmountDollars] = useState('');
  const [method, setMethod] = useState<TenderMethod>('CARD');
  const [submitting, setSubmitting] = useState(false);
  const [lastAttempt, setLastAttempt] = useState<{
    key: string;
    amountCents: number;
    method: TenderMethod;
  } | null>(null);

  const handleApplyPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountCents = dollarsToCents(amountDollars);
    if (amountCents <= 0) {
      onNotify('error', 'Enter a valid amount greater than $0.00');
      return;
    }

    const key = generateIdempotencyKey('pay');
    setSubmitting(true);
    try {
      const updated = await ledgerApi.applyPayment(
        order.id,
        { amountCents, method },
        key,
      );
      setLastAttempt({ key, amountCents, method });
      setAmountDollars('');
      onUpdated(updated);
      onNotify(
        'success',
        `Applied ${formatCents(amountCents)} via ${method} (Key: ${key.slice(0, 14)}...)`,
      );
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Payment failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReplayLast = async () => {
    if (!lastAttempt) return;
    setSubmitting(true);
    try {
      const updated = await ledgerApi.applyPayment(
        order.id,
        { amountCents: lastAttempt.amountCents, method: lastAttempt.method },
        lastAttempt.key,
      );
      onUpdated(updated);
      onNotify(
        'success',
        `Idempotent replay succeeded! Returned cached 201 without charging twice.`,
      );
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Replay failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-slate-900">Apply Split-Tender Payment</h2>
        {order.outstandingCents > 0 && (
          <button
            type="button"
            onClick={() => setAmountDollars((order.outstandingCents / 100).toFixed(2))}
            className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
          >
            Fill Remaining ({formatCents(order.outstandingCents)})
          </button>
        )}
      </div>

      <form onSubmit={handleApplyPayment} className="mt-4 space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-semibold text-slate-600">
              Amount (USD)
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              placeholder="0.00"
              value={amountDollars}
              onChange={(e) => setAmountDollars(e.target.value)}
              disabled={submitting || order.outstandingCents === 0}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none disabled:bg-slate-100"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600">
              Tender Method
            </label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as TenderMethod)}
              disabled={submitting || order.outstandingCents === 0}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none disabled:bg-slate-100"
            >
              <option value="CARD">CARD</option>
              <option value="CASH">CASH</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={submitting || order.outstandingCents === 0}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Processing...' : 'Submit Payment'}
          </button>

          {lastAttempt && (
            <button
              type="button"
              onClick={handleReplayLast}
              disabled={submitting}
              className="rounded-lg border border-slate-300 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
            >
              Simulate Idempotent Retry ({formatCents(lastAttempt.amountCents)})
            </button>
          )}
        </div>
      </form>
    </div>
  );
}