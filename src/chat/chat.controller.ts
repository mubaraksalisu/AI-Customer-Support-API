import { Body, Controller, Headers, Post, Query, Sse } from '@nestjs/common';
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
import { ConversationsService } from '../conversations/conversations.service';

@ApiTags('chat')
@Controller('chat')
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly conversationService: ConversationsService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Ask the support agent a question' })
  @ApiResponse({ status: 201, type: ChatResponseDto })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  async Chat(
    @Body() body: ChatRequestDto,
    @Headers('x-session-id') sessionId?: string,
  ): Promise<ChatResponseDto> {
    const activeSessionId =
      sessionId || this.conversationService.generateSessionId();
    const result = await this.chatService.chat(body.question, activeSessionId);

    return { ...result, sessionId: activeSessionId };
  }

  @Sse('stream')
  @ApiOperation({
    summary: 'Ask a question and stream the answer via Server-Sent Events',
  })
  @ApiProduces('text/event-stream')
  @ApiBadRequestResponse({ description: 'Validation failed' })
  streamChat(
    @Query() query: ChatStreamQueryDto,
    @Query('sessionId') sessionId?: string,
  ): Observable<MessageEvent> {
    const activeSessionId =
      sessionId || this.conversationService.generateSessionId();
    return this.chatService.chatStream(query.question, activeSessionId);
  }
}
