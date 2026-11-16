import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module.js';
import { IdempotencyService } from '../common/idempotency/idempotency.service.js';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';

@Module({
  imports: [OrdersModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, IdempotencyService],
  exports: [IdempotencyService],
})
export class PaymentsModule {}