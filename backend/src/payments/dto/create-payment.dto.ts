import { IsEnum, IsInt, Min } from 'class-validator';
import { TenderMethod } from '@prisma/client';

export class CreatePaymentDto {
  @IsInt({ message: 'amountCents must be an integer representing cents' })
  @Min(1, { message: 'amountCents must be at least 1 cent' })
  amountCents!: number;

  @IsEnum(TenderMethod, {
    message: 'method must be either CARD or CASH',
  })
  method!: TenderMethod;
}