import { Body, Controller, Post, Query, Sse } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOperation,
  ApiProduces,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ChatService } from './chat.service';
import { Observable } from 'rxjs';
import { ChatRequestDto } from './dto/chat-request.dto';
import { ChatStreamQueryDto } from './dto/chat-stream-query.dto';
import { ChatResponseDto } from './dto/chat-response.dto';

@ApiTags('chat')
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post()
  @ApiOperation({ summary: 'Ask the support agent a question' })
  @ApiResponse({ status: 201, type: ChatResponseDto })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  async Chat(@Body() body: ChatRequestDto): Promise<ChatResponseDto> {
    return await this.chatService.chat(body.question);
  }

  @Sse('stream')
  @ApiOperation({
    summary: 'Ask a question and stream the answer via Server-Sent Events',
  })
  @ApiProduces('text/event-stream')
  @ApiBadRequestResponse({ description: 'Validation failed' })
  streamChat(@Query() query: ChatStreamQueryDto): Observable<MessageEvent> {
    return this.chatService.chatStream(query.question);
  }
}
