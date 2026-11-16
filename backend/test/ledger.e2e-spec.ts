import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('Split-Tender Payment Ledger (E2E & Concurrency)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /healthz should confirm database readiness and deployment color', async () => {
    const res = await request(app.getHttpServer()).get('/healthz').expect(200);

    expect(res.body.status).toBe('ok');
    expect(res.body.database).toBe('connected');
    expect(['blue', 'green']).toContain(res.body.environment);
  });

  it('POST /orders should reject float amounts and non-positive integers', async () => {
    await request(app.getHttpServer())
      .post('/orders')
      .send({ totalCents: 19.99 })
      .expect(400);

    await request(app.getHttpServer())
      .post('/orders')
      .send({ totalCents: 0 })
      .expect(400);
  });

  it('should handle split-tender payments, idempotency retries, payload mismatch, and per-tender refunds', async () => {
    const orderRes = await request(app.getHttpServer())
      .post('/orders')
      .send({ totalCents: 10000 })
      .expect(201);

    const orderId: string = orderRes.body.id;
    expect(orderRes.body.status).toBe('PENDING');
    expect(orderRes.body.outstandingCents).toBe(10000);

    const pay1Key = `e2e-pay1-${orderId}`;
    const pay1Res = await request(app.getHttpServer())
      .post(`/orders/${orderId}/payments`)
      .set('Idempotency-Key', pay1Key)
      .send({ amountCents: 6000, method: 'CARD' })
      .expect(201);

    expect(pay1Res.body.status).toBe('PARTIALLY_PAID');
    expect(pay1Res.body.netPaidCents).toBe(6000);
    expect(pay1Res.body.outstandingCents).toBe(4000);

    const cardPaymentId: string = pay1Res.body.payments[0].id;

    const retryRes = await request(app.getHttpServer())
      .post(`/orders/${orderId}/payments`)
      .set('Idempotency-Key', pay1Key)
      .send({ amountCents: 6000, method: 'CARD' })
      .expect(201);

    expect(retryRes.body.payments).toHaveLength(1);
    expect(retryRes.body.netPaidCents).toBe(6000);

    await request(app.getHttpServer())
      .post(`/orders/${orderId}/payments`)
      .set('Idempotency-Key', pay1Key)
      .send({ amountCents: 5000, method: 'CARD' })
      .expect(422);

    const pay2Res = await request(app.getHttpServer())
      .post(`/orders/${orderId}/payments`)
      .set('Idempotency-Key', `e2e-pay2-${orderId}`)
      .send({ amountCents: 4000, method: 'CASH' })
      .expect(201);

    expect(pay2Res.body.status).toBe('PAID');
    expect(pay2Res.body.outstandingCents).toBe(0);
    expect(pay2Res.body.payments).toHaveLength(2);

    const refundRes = await request(app.getHttpServer())
      .post(`/orders/${orderId}/refunds`)
      .set('Idempotency-Key', `e2e-ref1-${orderId}`)
      .send({
        paymentId: cardPaymentId,
        amountCents: 2500,
        reason: 'Customer returned one item',
      })
      .expect(201);

    expect(refundRes.body.totalRefundedCents).toBe(2500);
    expect(refundRes.body.netPaidCents).toBe(7500);
    expect(refundRes.body.outstandingCents).toBe(2500);
    expect(refundRes.body.status).toBe('PARTIALLY_PAID');

    const cardTender = refundRes.body.payments.find(
      (p: { id: string }) => p.id === cardPaymentId,
    );
    expect(cardTender.refundableCents).toBe(3500);

    await request(app.getHttpServer())
      .post(`/orders/${orderId}/refunds`)
      .set('Idempotency-Key', `e2e-ref2-${orderId}`)
      .send({
        paymentId: cardPaymentId,
        amountCents: 4000,
        reason: 'Exceeds card tender balance',
      })
      .expect(422);
  });

  it('CONCURRENCY: 5 simultaneous full payments on the same order -> exactly 1 succeeds (201) and 4 fail (422)', async () => {
    const orderRes = await request(app.getHttpServer())
      .post('/orders')
      .send({ totalCents: 5000 })
      .expect(201);

    const orderId: string = orderRes.body.id;

    const concurrentRequests = Array.from({ length: 5 }, (_, idx) =>
      request(app.getHttpServer())
        .post(`/orders/${orderId}/payments`)
        .set('Idempotency-Key', `race-pay-${orderId}-${idx}`)
        .send({ amountCents: 5000, method: 'CARD' }),
    );

    const responses = await Promise.all(concurrentRequests);
    const statusCodes = responses.map((r) => r.status);

    const succeeded = statusCodes.filter((code) => code === 201);
    const rejected = statusCodes.filter((code) => code === 422);

    expect(succeeded).toHaveLength(1);
    expect(rejected).toHaveLength(4);

    const finalOrder = await request(app.getHttpServer())
      .get(`/orders/${orderId}`)
      .expect(200);

    expect(finalOrder.body.netPaidCents).toBe(5000);
    expect(finalOrder.body.outstandingCents).toBe(0);
    expect(finalOrder.body.payments).toHaveLength(1);
  });

  it('CONCURRENCY: 5 simultaneous refunds exceeding tender balance -> exactly 1 succeeds (201) and 4 fail (422)', async () => {
    const orderRes = await request(app.getHttpServer())
      .post('/orders')
      .send({ totalCents: 4000 })
      .expect(201);

    const orderId: string = orderRes.body.id;

    const payRes = await request(app.getHttpServer())
      .post(`/orders/${orderId}/payments`)
      .set('Idempotency-Key', `race-ref-setup-${orderId}`)
      .send({ amountCents: 4000, method: 'CARD' })
      .expect(201);

    const paymentId: string = payRes.body.payments[0].id;

    const concurrentRefunds = Array.from({ length: 5 }, (_, idx) =>
      request(app.getHttpServer())
        .post(`/orders/${orderId}/refunds`)
        .set('Idempotency-Key', `race-ref-${orderId}-${idx}`)
        .send({
          paymentId,
          amountCents: 3000,
          reason: `Concurrent refund attempt #${idx}`,
        }),
    );

    const responses = await Promise.all(concurrentRefunds);
    const statusCodes = responses.map((r) => r.status);

    const succeeded = statusCodes.filter((code) => code === 201);
    const rejected = statusCodes.filter((code) => code === 422);

    expect(succeeded).toHaveLength(1);
    expect(rejected).toHaveLength(4);

    const finalOrder = await request(app.getHttpServer())
      .get(`/orders/${orderId}`)
      .expect(200);

    expect(finalOrder.body.totalRefundedCents).toBe(3000);
    expect(finalOrder.body.payments[0].refundableCents).toBe(1000);
  });
});