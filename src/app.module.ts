import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ChatModule } from './chat/chat.module';
import { FaqModule } from './faq/faq.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Faq } from './faq/entities/faq.entity';
import { OrdersModule } from './orders/orders.module';
import { Order } from './orders/entities/order.entity';

function validateEnv(env: Record<string, unknown>) {
  const required = ['GEMINI_API_KEY', 'DATABASE_URL'];
  const missing = required.filter((key) => !env[key]);
  if (missing.length) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}`,
    );
  }
  return env;
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      entities: [Faq, Order],
      synchronize: true, // fine for development, turn off in production
    }),
    ChatModule,
    FaqModule,
    OrdersModule,
  ],
})
export class AppModule {}
