export type TenderMethod = 'CARD' | 'CASH';
export type OrderStatus = 'PENDING' | 'PARTIALLY_PAID' | 'PAID' | 'REFUNDED';

export interface RefundItem {
  id: string;
  paymentId: string;
  amountCents: number;
  reason: string | null;
  createdAt: string;
}

export interface PaymentItem {
  id: string;
  orderId: string;
  amountCents: number;
  method: TenderMethod;
  refundedCents: number;
  refundableCents: number;
  createdAt: string;
  refunds: RefundItem[];
}

export interface OrderLedger {
  id: string;
  totalCents: number;
  grossPaidCents: number;
  totalRefundedCents: number;
  netPaidCents: number;
  outstandingCents: number;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
  payments: PaymentItem[];
}

export interface HealthStatus {
  status: 'ok' | 'error';
  environment: 'blue' | 'green';
  database: 'connected' | 'disconnected';
  timestamp: string;
}