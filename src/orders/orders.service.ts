import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order } from './entities/order.entity';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
  ) {}

  async getOrderStatus(orderNumber: string): Promise<object | null> {
    try {
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
    } catch (error) {
      this.logger.error(
        `Order lookup failed for ${orderNumber}: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw error;
    }
  }
}
