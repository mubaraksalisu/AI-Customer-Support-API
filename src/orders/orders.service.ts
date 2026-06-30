import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order } from './entities/order.entity';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
  ) {}

  async getOrderStatus(orderNumber: string): Promise<object | null> {
    const order = await this.orderRepository.findOne({
      where: { orderNumber },
    });

    if (!order) return null;

    return {
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      status: order.status,
      item: order.item,
      createdAt: order.createdAt,
    };
  }
}
