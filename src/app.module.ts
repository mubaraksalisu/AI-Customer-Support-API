import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { ChatModule } from './chat/chat.module';
import { FaqModule } from './faq/faq.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Faq } from './faq/entities/faq.entity';
import { OrdersModule } from './orders/orders.module';
import { Order } from './orders/entities/order.entity';
import { ConversationsModule } from './conversations/conversations.module';
import { Conversation } from './conversations/entities/conversation.entity';

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
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 30 }]),
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      entities: [Faq, Order, Conversation],
      // Off by default so shared dev/prod databases can't drift from
      // unreviewed schema changes. Set DB_SYNCHRONIZE=true to create the
      // schema on a fresh database (first run only, no migrations exist yet).
      synchronize: process.env.DB_SYNCHRONIZE === 'true',
    }),
    ChatModule,
    FaqModule,
    OrdersModule,
    ConversationsModule,
  ],
  controllers: [AppController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
