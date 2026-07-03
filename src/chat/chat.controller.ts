import { Body, Controller, Post, Query, Sse } from '@nestjs/common';
import { ChatService } from './chat.service';
import { Observable } from 'rxjs';
import { ChatRequestDto } from './dto/chat-request.dto';
import { ChatStreamQueryDto } from './dto/chat-stream-query.dto';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post()
  async Chat(@Body() body: ChatRequestDto) {
    return await this.chatService.chat(body.question);
  }

  @Sse('stream')
  streamChat(@Query() query: ChatStreamQueryDto): Observable<MessageEvent> {
    return this.chatService.chatStream(query.question);
  }
}
