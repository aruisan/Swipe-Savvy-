import { HealthStatus, OrderLedger, TenderMethod } from '@/types/ledger';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000').replace(/\/$/, '');

async function parseApiResponse<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = Array.isArray(data?.message)
      ? data.message.join(', ')
      : data?.message || `HTTP Error ${res.status}`;
    throw new Error(message);
  }
  return data as T;
}

export function generateIdempotencyKey(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export const ledgerApi = {
  async getHealth(): Promise<HealthStatus> {
    const res = await fetch(`${API_BASE}/healthz`, { cache: 'no-store' });
    return parseApiResponse<HealthStatus>(res);
  },

  async listOrders(): Promise<OrderLedger[]> {
    const res = await fetch(`${API_BASE}/orders`, { cache: 'no-store' });
    return parseApiResponse<OrderLedger[]>(res);
  },

  async getOrder(orderId: string): Promise<OrderLedger> {
    const res = await fetch(`${API_BASE}/orders/${orderId}`, { cache: 'no-store' });
    return parseApiResponse<OrderLedger>(res);
  },

  async createOrder(totalCents: number): Promise<OrderLedger> {
    const res = await fetch(`${API_BASE}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ totalCents }),
    });
    return parseApiResponse<OrderLedger>(res);
  },

  async applyPayment(
    orderId: string,
    payload: { amountCents: number; method: TenderMethod },
    idempotencyKey: string,
  ): Promise<OrderLedger> {
    const res = await fetch(`${API_BASE}/orders/${orderId}/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(payload),
    });
    return parseApiResponse<OrderLedger>(res);
  },

  async applyRefund(
    orderId: string,
    payload: { paymentId: string; amountCents: number; reason?: string },
    idempotencyKey: string,
  ): Promise<OrderLedger> {
    const res = await fetch(`${API_BASE}/orders/${orderId}/refunds`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(payload),
    });
    return parseApiResponse<OrderLedger>(res);
  },
};