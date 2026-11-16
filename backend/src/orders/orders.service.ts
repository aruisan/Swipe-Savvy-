import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { orderWithLedgerInclude } from '../prisma/prisma.extension.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { OrderLedgerResponse, OrderMapper } from './mappers/order.mapper.js';

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateOrderDto): Promise<OrderLedgerResponse> {
    const created = await this.prisma.db.order.create({
      data: {
        totalCents: dto.totalCents,
      },
      include: orderWithLedgerInclude,
    });

    return OrderMapper.toResponse(created as any);
  }

  async findAll(): Promise<OrderLedgerResponse[]> {
    const orders = await this.prisma.db.order.findMany({
      orderBy: { createdAt: 'desc' },
      take: 25,
      include: orderWithLedgerInclude,
    });

    return orders.map((order) => OrderMapper.toResponse(order as any));
  }

  async findOne(id: string): Promise<OrderLedgerResponse> {
    const order = await this.prisma.db.order.findWithLedger(id);

    if (!order) {
      throw new NotFoundException(`Order with ID "${id}" not found`);
    }

    return OrderMapper.toResponse(order);
  }
}