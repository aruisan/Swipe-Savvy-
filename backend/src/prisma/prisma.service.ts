import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createExtendedPrismaClient, ExtendedPrismaClient } from './prisma.extension.js';

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private readonly baseClient: PrismaClient;
  public readonly db: ExtendedPrismaClient;

  constructor() {
    this.baseClient = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });
    this.db = createExtendedPrismaClient(this.baseClient);
  }

  get raw(): PrismaClient {
    return this.baseClient;
  }

  async onModuleInit(): Promise<void> {
    await this.baseClient.$connect();
    this.logger.log('PostgreSQL connection pool established successfully');
  }

  async onModuleDestroy(): Promise<void> {
    await this.baseClient.$disconnect();
    this.logger.log('PostgreSQL connection pool closed gracefully');
  }
}