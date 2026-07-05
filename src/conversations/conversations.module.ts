import { Module } from '@nestjs/common';
import { ConversationsService } from './conversations.service';
import { Conversation } from './entities/conversation.entity';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [TypeOrmModule.forFeature([Conversation])],
  providers: [ConversationsService],
  exports: [ConversationsService],
})
export class ConversationsModule {}
