import { Module } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { FaqModule } from '../faq/faq.module';
import { OrdersModule } from '../orders/orders.module';
import { ConversationsModule } from '../conversations/conversations.module';

@Module({
  imports: [FaqModule, OrdersModule, ConversationsModule],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
