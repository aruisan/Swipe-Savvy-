import { OrderWithLedgerDetails } from '../../prisma/prisma.extension.js';

export interface RefundResponse {
  id: string;
  paymentId: string;
  amountCents: number;
  reason: string | null;
  createdAt: string;
}

export interface PaymentResponse {
  id: string;
  orderId: string;
  amountCents: number;
  method: 'CARD' | 'CASH';
  refundedCents: number;
  refundableCents: number;
  createdAt: string;
  refunds: RefundResponse[];
}

export interface OrderLedgerResponse {
  id: string;
  totalCents: number;
  grossPaidCents: number;
  totalRefundedCents: number;
  netPaidCents: number;
  outstandingCents: number;
  status: 'PENDING' | 'PARTIALLY_PAID' | 'PAID' | 'REFUNDED';
  createdAt: string;
  updatedAt: string;
  payments: PaymentResponse[];
}

export class OrderMapper {
  static toResponse(order: OrderWithLedgerDetails): OrderLedgerResponse {
    return {
      id: order.id,
      totalCents: order.totalCents,
      grossPaidCents: order.grossPaidCents,
      totalRefundedCents: order.totalRefundedCents,
      netPaidCents: order.netPaidCents,
      outstandingCents: order.outstandingCents,
      status: order.status,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      payments: (order.payments ?? []).map((payment) => ({
        id: payment.id,
        orderId: payment.orderId,
        amountCents: payment.amountCents,
        method: payment.method,
        refundedCents: payment.refundedCents,
        refundableCents: payment.refundableCents,
        createdAt: payment.createdAt.toISOString(),
        refunds: (payment.refunds ?? []).map((refund) => ({
          id: refund.id,
          paymentId: refund.paymentId,
          amountCents: refund.amountCents,
          reason: refund.reason,
          createdAt: refund.createdAt.toISOString(),
        })),
      })),
    };
  }
}