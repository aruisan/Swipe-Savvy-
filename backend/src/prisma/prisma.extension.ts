import { Prisma, PrismaClient } from '@prisma/client';

/**
 * Definición de relaciones incluidas para el libro contable (Ledger).
 * `satisfies` valida la estructura contra Prisma.OrderInclude sin perder los tipos literales.
 */
export const orderWithLedgerInclude = {
  payments: {
    orderBy: { createdAt: 'asc' },
    include: {
      refunds: {
        orderBy: { createdAt: 'asc' },
      },
    },
  },
} satisfies Prisma.OrderInclude;

export type OrderWithPaymentsAndRefunds = Prisma.OrderGetPayload<{
  include: typeof orderWithLedgerInclude;
}>;

export type PaymentWithRefunds = OrderWithPaymentsAndRefunds['payments'][number];

export type PaymentWithBalances = PaymentWithRefunds & {
  refundedCents: number;
  refundableCents: number;
};

export type OrderWithLedgerDetails = Omit<OrderWithPaymentsAndRefunds, 'payments'> & {
  grossPaidCents: number;
  totalRefundedCents: number;
  netPaidCents: number;
  outstandingCents: number;
  payments: PaymentWithBalances[];
};

function sumRefundedCents(refunds?: ReadonlyArray<{ amountCents: number }>): number {
  if (!Array.isArray(refunds)) return 0;
  return refunds.reduce((sum, refund) => sum + refund.amountCents, 0);
}

function sumNetPaidCents(
  payments?: ReadonlyArray<{
    amountCents: number;
    refunds?: ReadonlyArray<{ amountCents: number }>;
  }>,
): number {
  if (!Array.isArray(payments)) return 0;
  return payments.reduce(
    (netSum, payment) => netSum + (payment.amountCents - sumRefundedCents(payment.refunds)),
    0,
  );
}

export function createExtendedPrismaClient(baseClient: PrismaClient) {
  return baseClient.$extends({
    name: 'ledger-financial-extensions',

    result: {
      payment: {
        refundedCents: {
          needs: {},
          compute(payment: { refunds?: ReadonlyArray<{ amountCents: number }> }): number {
            return sumRefundedCents(payment.refunds);
          },
        },
        refundableCents: {
          needs: { amountCents: true },
          compute(payment: {
            amountCents: number;
            refunds?: ReadonlyArray<{ amountCents: number }>;
          }): number {
            return payment.amountCents - sumRefundedCents(payment.refunds);
          },
        },
      },

      order: {
        grossPaidCents: {
          needs: {},
          compute(order: { payments?: ReadonlyArray<{ amountCents: number }> }): number {
            if (!Array.isArray(order.payments)) return 0;
            return order.payments.reduce((sum, payment) => sum + payment.amountCents, 0);
          },
        },
        totalRefundedCents: {
          needs: {},
          compute(order: {
            payments?: ReadonlyArray<{ refunds?: ReadonlyArray<{ amountCents: number }> }>;
          }): number {
            if (!Array.isArray(order.payments)) return 0;
            return order.payments.reduce(
              (totalSum, payment) => totalSum + sumRefundedCents(payment.refunds),
              0,
            );
          },
        },
        netPaidCents: {
          needs: {},
          compute(order: {
            payments?: ReadonlyArray<{
              amountCents: number;
              refunds?: ReadonlyArray<{ amountCents: number }>;
            }>;
          }): number {
            return sumNetPaidCents(order.payments);
          },
        },
        outstandingCents: {
          needs: { totalCents: true },
          compute(order: {
            totalCents: number;
            payments?: ReadonlyArray<{
              amountCents: number;
              refunds?: ReadonlyArray<{ amountCents: number }>;
            }>;
          }): number {
            const netPaid = sumNetPaidCents(order.payments);
            return Math.max(0, order.totalCents - netPaid);
          },
        },
      },
    },

    model: {
      order: {
        async findWithLedger(orderId: string): Promise<OrderWithLedgerDetails | null> {
          const context = Prisma.getExtensionContext(this);
          return (context as unknown as PrismaClient['order']).findUnique({
            where: { id: orderId },
            include: orderWithLedgerInclude,
          }) as unknown as Promise<OrderWithLedgerDetails | null>;
        },
      },
    },
  });
}

export type ExtendedPrismaClient = ReturnType<typeof createExtendedPrismaClient>;