import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { IdempotencyService } from '../common/idempotency/idempotency.service.js';
import { OrderLedgerResponse, OrderMapper } from '../orders/mappers/order.mapper.js';
import { OrderWithLedgerDetails, OrderWithPaymentsAndRefunds } from '../prisma/prisma.extension.js';
import { CreateRefundDto } from './dto/create-refund.dto.js';

@Injectable()
export class RefundsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly idempotency: IdempotencyService,
  ) {}

  async applyRefund(
    orderId: string,
    dto: CreateRefundDto,
    idempotencyKey?: string,
  ): Promise<OrderLedgerResponse> {
    if (!idempotencyKey || idempotencyKey.trim().length === 0) {
      throw new BadRequestException('Idempotency-Key header is required');
    }

    const normalizedKey = idempotencyKey.trim();
    const endpoint = `POST:/orders/${orderId}/refunds`;
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

      const lockedPayments = await tx.$queryRaw<
        Array<{ id: string; order_id: string; amount_cents: number }>
      >`
        SELECT id, order_id, amount_cents
        FROM payments
        WHERE id = ${dto.paymentId}::uuid
          AND order_id = ${orderId}::uuid
        FOR UPDATE;
      `;

      if (lockedPayments.length === 0) {
        throw new NotFoundException(
          `Payment "${dto.paymentId}" not found for order "${orderId}"`,
        );
      }

      const payment = lockedPayments[0];

      const refundSumRows = await tx.$queryRaw<Array<{ refunded_cents: bigint }>>`
        SELECT COALESCE(SUM(amount_cents), 0) AS refunded_cents
        FROM refunds
        WHERE payment_id = ${dto.paymentId}::uuid;
      `;

      const alreadyRefundedCents = Number(refundSumRows[0]?.refunded_cents ?? 0);
      const refundableCents = payment.amount_cents - alreadyRefundedCents;

      if (refundableCents <= 0) {
        throw new UnprocessableEntityException(
          `Payment "${dto.paymentId}" has already been fully refunded`,
        );
      }

      if (dto.amountCents > refundableCents) {
        throw new UnprocessableEntityException(
          `Refund amount (${dto.amountCents} cents) exceeds remaining refundable balance (${refundableCents} cents) for payment "${dto.paymentId}"`,
        );
      }

      await tx.refund.create({
        data: {
          paymentId: dto.paymentId,
          amountCents: dto.amountCents,
          reason: dto.reason?.trim() || null,
          idempotencyKey: `${orderId}:${normalizedKey}`,
        },
      });

      const orderBalances = await tx.$queryRaw<
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

      const grossPaid = Number(orderBalances[0]?.gross_paid_cents ?? 0);
      const totalRefunded = Number(orderBalances[0]?.total_refunded_cents ?? 0);
      const netPaid = grossPaid - totalRefunded;

      let nextStatus: OrderStatus;
      if (netPaid === 0 && grossPaid > 0) {
        nextStatus = OrderStatus.REFUNDED;
      } else if (netPaid >= order.total_cents) {
        nextStatus = OrderStatus.PAID;
      } else {
        nextStatus = OrderStatus.PARTIALLY_PAID;
      }

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

      const response = this.hydrateAndMapOrder(updatedOrder);

      await this.idempotency.complete(tx, {
        key: normalizedKey,
        endpoint,
        statusCode: 201,
        responseBody: response,
      });

      return response;
    });
  }
  private hydrateAndMapOrder(order: OrderWithPaymentsAndRefunds): OrderLedgerResponse {
    let grossPaidCents = 0;
    let totalRefundedCents = 0;

    const payments = order.payments.map((p) => {
        const refundedCents = p.refunds.reduce((sum, r) => sum + r.amountCents, 0);
        grossPaidCents += p.amountCents;
        totalRefundedCents += refundedCents;

        return {
        ...p,
        refundedCents,
        refundableCents: p.amountCents - refundedCents,
        };
    });

    const netPaidCents = grossPaidCents - totalRefundedCents;

    const hydrated: OrderWithLedgerDetails = {
        ...order,
        grossPaidCents,
        totalRefundedCents,
        netPaidCents,
        outstandingCents: Math.max(0, order.totalCents - netPaidCents),
        payments,
    };

    return OrderMapper.toResponse(hydrated);
  }
}