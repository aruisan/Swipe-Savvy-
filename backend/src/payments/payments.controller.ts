import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { PaymentsService } from './payments.service.js';
import { CreatePaymentDto } from './dto/create-payment.dto.js';
import { OrderLedgerResponse } from '../orders/mappers/order.mapper.js';

@Controller('orders/:id/payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Param('id', new ParseUUIDPipe({ version: '4' })) orderId: string,
    @Body() dto: CreatePaymentDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<OrderLedgerResponse> {
    return this.paymentsService.applyPayment(orderId, dto, idempotencyKey);
  }
}