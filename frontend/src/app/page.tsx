'use client';

import { useEffect, useState } from 'react';
import { DeploymentBadge } from '@/components/DeploymentBadge';
import { OrderSummaryCard } from '@/components/OrderSummaryCard';
import { PaymentForm } from '@/components/PaymentForm';
import { TenderList } from '@/components/TenderList';
import { ledgerApi } from '@/lib/api';
import { dollarsToCents, formatCents } from '@/lib/currency';
import { OrderLedger } from '@/types/ledger';

export default function LedgerDashboardPage() {
  const [orders, setOrders] = useState<OrderLedger[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<OrderLedger | null>(null);
  const [newOrderDollars, setNewOrderDollars] = useState('50.00');
  const [creating, setCreating] = useState(false);
  const [notification, setNotification] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const notify = (type: 'success' | 'error', text: string) => {
    setNotification({ type, text });
  };

  useEffect(() => {
    ledgerApi
      .listOrders()
      .then((list) => {
        setOrders(list);
        if (list.length > 0) {
          setSelectedOrder(list[0]);
        }
      })
      .catch(() => {
        notify('error', 'Could not connect to Ledger API. Ensure backend is running.');
      });
  }, []);

  const handleOrderUpdated = (updated: OrderLedger) => {
    setSelectedOrder(updated);
    setOrders((prev) =>
      prev.some((o) => o.id === updated.id)
        ? prev.map((o) => (o.id === updated.id ? updated : o))
        : [updated, ...prev],
    );
  };

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    const totalCents = dollarsToCents(newOrderDollars);
    if (totalCents <= 0) {
      notify('error', 'Order total must be greater than $0.00');
      return;
    }

    setCreating(true);
    try {
      const created = await ledgerApi.createOrder(totalCents);
      handleOrderUpdated(created);
      notify('success', `Created new order for ${formatCents(created.totalCents)}`);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to create order');
    } finally {
      setCreating(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div>
            <h1 className="text-lg font-extrabold tracking-tight text-slate-900">
              Swipe Savvy — Split-Tender Payment Ledger
            </h1>
            <p className="text-xs text-slate-500">
              Integer-cent accounting · Row-level pessimistic locking · Idempotent API
            </p>
          </div>
          <DeploymentBadge />
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-8">
        {notification && (
          <div
            className={`mb-6 flex items-center justify-between rounded-lg border px-4 py-3 text-sm font-medium ${
              notification.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-rose-200 bg-rose-50 text-rose-800'
            }`}
          >
            <span>{notification.text}</span>
            <button
              type="button"
              onClick={() => setNotification(null)}
              className="ml-4 text-xs font-bold opacity-70 hover:opacity-100"
            >
              ✕
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          {/* Columna Izquierda: Crear Orden + Historial */}
          <aside className="space-y-6 lg:col-span-4">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700">
                Create New Order
              </h2>
              <form onSubmit={handleCreateOrder} className="mt-3 space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600">
                    Order Total (USD)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={newOrderDollars}
                    onChange={(e) => setNewOrderDollars(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <button
                  type="submit"
                  disabled={creating}
                  className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
                >
                  {creating ? 'Creating...' : 'Create Order'}
                </button>
              </form>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700">
                Recent Orders ({orders.length})
              </h2>
              <div className="mt-3 max-h-96 space-y-2 overflow-y-auto pr-1">
                {orders.map((order) => {
                  const isSelected = selectedOrder?.id === order.id;
                  return (
                    <button
                      key={order.id}
                      type="button"
                      onClick={() => setSelectedOrder(order)}
                      className={`w-full rounded-lg border p-3 text-left transition ${
                        isSelected
                          ? 'border-indigo-500 bg-indigo-50/60'
                          : 'border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-semibold text-slate-700">
                          #{order.id.slice(0, 8)}
                        </span>
                        <span className="text-xs font-bold text-slate-900">
                          {formatCents(order.totalCents)}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                        <span>{order.status}</span>
                        <span>Due: {formatCents(order.outstandingCents)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </aside>

          {/* Columna Derecha: Libro Contable de la Orden Seleccionada */}
          <section className="space-y-6 lg:col-span-8">
            {selectedOrder ? (
              <>
                <OrderSummaryCard order={selectedOrder} />
                <PaymentForm
                  order={selectedOrder}
                  onUpdated={handleOrderUpdated}
                  onNotify={notify}
                />
                <TenderList
                  order={selectedOrder}
                  onUpdated={handleOrderUpdated}
                  onNotify={notify}
                />
              </>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm text-slate-500">
                Create or select an order on the left to inspect its split-tender ledger.
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}