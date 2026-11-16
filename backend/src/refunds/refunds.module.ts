import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module.js';
import { RefundsController } from './refunds.controller.js';
import { RefundsService } from './refunds.service.js';

@Module({
  imports: [PaymentsModule],
  controllers: [RefundsController],
  providers: [RefundsService],
})
export class RefundsModule {}