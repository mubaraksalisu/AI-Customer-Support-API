import { Body, Controller, Post, Query, Sse } from '@nestjs/common';
import { ChatService } from './chat.service';
import { Observable } from 'rxjs';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post()
  async Chat(@Body() body: { question: string }) {
    return await this.chatService.chat(body.question);
  }

  @Sse('stream')
  streamChat(@Query('question') question: string): Observable<MessageEvent> {
    return this.chatService.chatStream(question);
  }
}
