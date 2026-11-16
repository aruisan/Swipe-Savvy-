import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';

export interface HealthResponse {
  status: 'ok' | 'error';
  environment: 'blue' | 'green';
  database: 'connected' | 'disconnected';
  timestamp: string;
}

@Controller('healthz')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  async check(): Promise<HealthResponse> {
    const rawColor = this.config.get<string>('DEPLOYMENT_COLOR', 'blue').toLowerCase();
    const environment = rawColor === 'green' ? 'green' : 'blue';

    try {
      await this.prisma.raw.$queryRaw`SELECT 1`;

      return {
        status: 'ok',
        environment,
        database: 'connected',
        timestamp: new Date().toISOString(),
      };
    } catch {
      throw new ServiceUnavailableException({
        status: 'error',
        environment,
        database: 'disconnected',
        timestamp: new Date().toISOString(),
      });
    }
  }
}