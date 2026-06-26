import { Body, Controller, Post } from '@nestjs/common';
import { ChatService } from './chat.service';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post()
  async Chat(@Body() body: { question: string }) {
    return await this.chatService.chat(body.question);
  }
}
