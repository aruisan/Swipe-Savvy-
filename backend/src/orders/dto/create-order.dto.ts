import { IsInt, Min } from 'class-validator';

export class CreateOrderDto {
  @IsInt({ message: 'totalCents must be an integer representing cents' })
  @Min(1, { message: 'totalCents must be at least 1 cent' })
  totalCents!: number;
}