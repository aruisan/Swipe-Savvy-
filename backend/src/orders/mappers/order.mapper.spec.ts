import { describe, expect, it } from 'vitest';
import { OrderStatus, TenderMethod } from '@prisma/client';
import { OrderMapper } from './order.mapper.js';
import { OrderWithLedgerDetails } from '../../prisma/prisma.extension.js';

describe('OrderMapper (Unit)', () => {
  it('should map an order with split-tender payments and partial refunds accurately in cents', () => {
    const now = new Date('2026-11-16T08:00:00.000Z');

    const mockOrder: OrderWithLedgerDetails = {
      id: '11111111-1111-4111-8111-111111111111',
      totalCents: 10000,
      status: OrderStatus.PARTIALLY_PAID,
      createdAt: now,
      updatedAt: now,
      grossPaidCents: 10000,
      totalRefundedCents: 2500,
      netPaidCents: 7500,
      outstandingCents: 2500,
      payments: [
        {
          id: '22222222-2222-4222-8222-222222222222',
          orderId: '11111111-1111-4111-8111-111111111111',
          amountCents: 6000,
          method: TenderMethod.CARD,
          idempotencyKey: 'order-1:pay-1',
          createdAt: now,
          refundedCents: 2500,
          refundableCents: 3500,
          refunds: [
            {
              id: '33333333-3333-4333-8333-333333333333',
              paymentId: '22222222-2222-4222-8222-222222222222',
              amountCents: 2500,
              reason: 'Partial item return',
              idempotencyKey: 'order-1:ref-1',
              createdAt: now,
            },
          ],
        },
        {
          id: '44444444-4444-4444-8444-444444444444',
          orderId: '11111111-1111-4111-8111-111111111111',
          amountCents: 4000,
          method: TenderMethod.CASH,
          idempotencyKey: 'order-1:pay-2',
          createdAt: now,
          refundedCents: 0,
          refundableCents: 4000,
          refunds: [],
        },
      ],
    };

    const result = OrderMapper.toResponse(mockOrder);

    expect(result.totalCents).toBe(10000);
    expect(result.grossPaidCents).toBe(10000);
    expect(result.totalRefundedCents).toBe(2500);
    expect(result.netPaidCents).toBe(7500);
    expect(result.outstandingCents).toBe(2500);
    expect(result.payments).toHaveLength(2);
    expect(result.payments[0].refundableCents).toBe(3500);
    expect(result.payments[1].refundableCents).toBe(4000);
  });
});