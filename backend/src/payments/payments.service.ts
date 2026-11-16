import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { IdempotencyService } from '../common/idempotency/idempotency.service.js';
import { OrderLedgerResponse } from '../orders/mappers/order.mapper.js';
import { OrdersService } from '../orders/orders.service.js';
import { CreatePaymentDto } from './dto/create-payment.dto.js';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly idempotency: IdempotencyService,
    private readonly ordersService: OrdersService,
  ) {}

  async applyPayment(
    orderId: string,
    dto: CreatePaymentDto,
    idempotencyKey?: string,
  ): Promise<OrderLedgerResponse> {
    if (!idempotencyKey || idempotencyKey.trim().length === 0) {
      throw new BadRequestException('Idempotency-Key header is required');
    }

    const normalizedKey = idempotencyKey.trim();
    const endpoint = `POST:/orders/${orderId}/payments`;
    const requestHash = this.idempotency.hashPayload(dto);

    return this.prisma.raw.$transaction(async (tx) => {
      const cached = await this.idempotency.acquireOrReplay<OrderLedgerResponse>(tx, {
        key: normalizedKey,
        endpoint,
        requestHash,
      });

      if (cached.hit && cached.body) {
        return cached.body;
      }

      const lockedOrders = await tx.$queryRaw<
        Array<{ id: string; total_cents: number; status: OrderStatus }>
      >`
        SELECT id, total_cents, status
        FROM orders
        WHERE id = ${orderId}::uuid
        FOR UPDATE;
      `;

      if (lockedOrders.length === 0) {
        throw new NotFoundException(`Order with ID "${orderId}" not found`);
      }

      const order = lockedOrders[0];

      const balanceRows = await tx.$queryRaw<
        Array<{ gross_paid_cents: bigint; total_refunded_cents: bigint }>
      >`
        SELECT
          COALESCE(SUM(p.amount_cents), 0) AS gross_paid_cents,
          COALESCE((
            SELECT SUM(r.amount_cents)
            FROM refunds r
            INNER JOIN payments p2 ON p2.id = r.payment_id
            WHERE p2.order_id = ${orderId}::uuid
          ), 0) AS total_refunded_cents
        FROM payments p
        WHERE p.order_id = ${orderId}::uuid;
      `;

      const grossPaid = Number(balanceRows[0]?.gross_paid_cents ?? 0);
      const totalRefunded = Number(balanceRows[0]?.total_refunded_cents ?? 0);
      const netPaidCents = grossPaid - totalRefunded;
      const outstandingCents = order.total_cents - netPaidCents;

      if (outstandingCents <= 0) {
        throw new UnprocessableEntityException('Order is already fully paid');
      }

      if (dto.amountCents > outstandingCents) {
        throw new UnprocessableEntityException(
          `Payment amount (${dto.amountCents} cents) exceeds remaining balance (${outstandingCents} cents)`,
        );
      }

      await tx.payment.create({
        data: {
          orderId,
          amountCents: dto.amountCents,
          method: dto.method,
          idempotencyKey: normalizedKey,
        },
      });

      const newNetPaid = netPaidCents + dto.amountCents;
      const nextStatus: OrderStatus =
        newNetPaid === order.total_cents ? OrderStatus.PAID : OrderStatus.PARTIALLY_PAID;

      await tx.order.update({
        where: { id: orderId },
        data: { status: nextStatus },
      });

      const updatedOrder = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
        include: {
          payments: {
            orderBy: { createdAt: 'asc' },
            include: {
              refunds: { orderBy: { createdAt: 'asc' } },
            },
          },
        },
      });

      const response = this.buildOrderResponse(updatedOrder);

      await this.idempotency.complete(tx, {
        key: normalizedKey,
        endpoint,
        statusCode: 201,
        responseBody: response,
      });

      return response;
    });
  }

  private buildOrderResponse(order: {
    id: string;
    totalCents: number;
    status: OrderStatus;
    createdAt: Date;
    updatedAt: Date;
    payments: Array<{
      id: string;
      orderId: string;
      amountCents: number;
      method: 'CARD' | 'CASH';
      createdAt: Date;
      refunds: Array<{
        id: string;
        paymentId: string;
        amountCents: number;
        reason: string | null;
        createdAt: Date;
      }>;
    }>;
  }): OrderLedgerResponse {
    let grossPaidCents = 0;
    let totalRefundedCents = 0;

    const payments = order.payments.map((p) => {
      const refundedCents = p.refunds.reduce((sum, r) => sum + r.amountCents, 0);
      grossPaidCents += p.amountCents;
      totalRefundedCents += refundedCents;

      return {
        id: p.id,
        orderId: p.orderId,
        amountCents: p.amountCents,
        method: p.method,
        refundedCents,
        refundableCents: p.amountCents - refundedCents,
        createdAt: p.createdAt.toISOString(),
        refunds: p.refunds.map((r) => ({
          id: r.id,
          paymentId: r.paymentId,
          amountCents: r.amountCents,
          reason: r.reason,
          createdAt: r.createdAt.toISOString(),
        })),
      };
    });

    const netPaidCents = grossPaidCents - totalRefundedCents;

    return {
      id: order.id,
      totalCents: order.totalCents,
      grossPaidCents,
      totalRefundedCents,
      netPaidCents,
      outstandingCents: Math.max(0, order.totalCents - netPaidCents),
      status: order.status,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      payments,
    };
  }
}