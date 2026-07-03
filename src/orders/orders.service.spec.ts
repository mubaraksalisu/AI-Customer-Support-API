import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrdersService } from './orders.service';
import { Order } from './entities/order.entity';

describe('OrdersService', () => {
  let service: OrdersService;
  let repository: jest.Mocked<Repository<Order>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        {
          provide: getRepositoryToken(Order),
          useValue: { findOne: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
    repository = module.get(getRepositoryToken(Order));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('returns order details when the order exists', async () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    repository.findOne.mockResolvedValue({
      id: 1,
      orderNumber: 'ORD-001',
      customerName: 'Jane Doe',
      status: 'shipped',
      item: 'Widget',
      createdAt,
    } as Order);

    const result = await service.getOrderStatus('ORD-001');

    expect(repository.findOne).toHaveBeenCalledWith({
      where: { orderNumber: 'ORD-001' },
    });
    expect(result).toEqual({
      orderNumber: 'ORD-001',
      customerName: 'Jane Doe',
      status: 'shipped',
      item: 'Widget',
      createdAt,
    });
  });

  it('returns null when the order does not exist', async () => {
    repository.findOne.mockResolvedValue(null);

    const result = await service.getOrderStatus('ORD-999');

    expect(result).toBeNull();
  });
});
