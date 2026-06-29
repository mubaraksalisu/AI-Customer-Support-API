import { Module } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { FaqModule } from 'src/faq/faq.module';

@Module({
  imports: [FaqModule],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
