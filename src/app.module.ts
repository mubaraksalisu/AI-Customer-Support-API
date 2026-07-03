import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ChatModule } from './chat/chat.module';
import { FaqModule } from './faq/faq.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Faq } from './faq/entities/faq.entity';
import { OrdersModule } from './orders/orders.module';
import { Order } from './orders/entities/order.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      entities: [Faq, Order],
      synchronize: false, // fine for development, turn off in production
    }),
    ChatModule,
    FaqModule,
    OrdersModule,
  ],
})
export class AppModule {}
