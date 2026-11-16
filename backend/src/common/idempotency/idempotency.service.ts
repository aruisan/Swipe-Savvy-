import {
  ConflictException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';

export interface CachedIdempotentResponse<T> {
  hit: boolean;
  statusCode?: number;
  body?: T;
}

@Injectable()
export class IdempotencyService {

  hashPayload(payload: unknown): string {
    const serialized = JSON.stringify(payload ?? {});
    return createHash('sha256').update(serialized).digest('hex');
  }

  async acquireOrReplay<T>(
    tx: Prisma.TransactionClient,
    params: {
      key: string;
      endpoint: string;
      requestHash: string;
    },
  ): Promise<CachedIdempotentResponse<T>> {
    const { key, endpoint, requestHash } = params;

    const inserted = await tx.$executeRaw`
      INSERT INTO idempotency_records (
        id, idempotency_key, endpoint, request_hash, status, created_at, updated_at
      )
      VALUES (
        gen_random_uuid(), ${key}, ${endpoint}, ${requestHash}, 'IN_PROGRESS', NOW(), NOW()
      )
      ON CONFLICT (idempotency_key, endpoint) DO NOTHING;
    `;

    if (inserted === 1) {
      return { hit: false };
    }

    const existingRows = await tx.$queryRaw<
      Array<{
        request_hash: string;
        status: 'IN_PROGRESS' | 'COMPLETED';
        response_code: number | null;
        response_body: unknown;
      }>
    >`
      SELECT request_hash, status, response_code, response_body
      FROM idempotency_records
      WHERE idempotency_key = ${key} AND endpoint = ${endpoint}
      FOR UPDATE;
    `;

    const record = existingRows[0];

    if (record.request_hash !== requestHash) {
      throw new UnprocessableEntityException(
        'Idempotency-Key was already used with a different request payload',
      );
    }

    if (record.status === 'IN_PROGRESS') {
      throw new ConflictException(
        'A request with this Idempotency-Key is currently being processed',
      );
    }

    return {
      hit: true,
      statusCode: record.response_code ?? 201,
      body: record.response_body as T,
    };
  }


  async complete(
    tx: Prisma.TransactionClient,
    params: {
      key: string;
      endpoint: string;
      statusCode: number;
      responseBody: unknown;
    },
  ): Promise<void> {
    const { key, endpoint, statusCode, responseBody } = params;
    const serializedJson = JSON.stringify(responseBody);

    await tx.$executeRaw`
      UPDATE idempotency_records
      SET status = 'COMPLETED',
          response_code = ${statusCode},
          response_body = ${serializedJson}::jsonb,
          updated_at = NOW()
      WHERE idempotency_key = ${key} AND endpoint = ${endpoint};
    `;
  }
}