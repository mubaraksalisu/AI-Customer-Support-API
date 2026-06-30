import { Module } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { FaqModule } from 'src/faq/faq.module';
import { OrdersModule } from 'src/orders/orders.module';

@Module({
  imports: [FaqModule, OrdersModule],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
