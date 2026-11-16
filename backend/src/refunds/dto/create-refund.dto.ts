import { IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class CreateRefundDto {
  @IsUUID('4', { message: 'paymentId must be a valid UUID v4' })
  paymentId!: string;

  @IsInt({ message: 'amountCents must be an integer representing cents' })
  @Min(1, { message: 'amountCents must be at least 1 cent' })
  amountCents!: number;

  @IsOptional()
  @IsString({ message: 'reason must be a string' })
  @MaxLength(255, { message: 'reason cannot exceed 255 characters' })
  reason?: string;
}