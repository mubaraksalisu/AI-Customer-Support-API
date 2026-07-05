import { Body, Controller, Headers, Post, Query, Sse } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiHeader,
  ApiOperation,
  ApiProduces,
  ApiResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ChatService } from './chat.service';
import { Observable } from 'rxjs';
import { ChatRequestDto } from './dto/chat-request.dto';
import { ChatStreamQueryDto } from './dto/chat-stream-query.dto';
import { ChatResponseDto } from './dto/chat-response.dto';
import { ConversationsService } from '../conversations/conversations.service';

@ApiTags('chat')
@Throttle({ default: { limit: 10, ttl: 60_000 } })
@Controller('chat')
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly conversationService: ConversationsService,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Ask the support agent a question',
    description:
      'Answers using conversation history for the given session, RAG over the FAQ knowledge base, and the check_order_status tool when relevant.',
  })
  @ApiHeader({
    name: 'x-session-id',
    required: false,
    description:
      'Session ID to continue an existing conversation. Omit to start a new one — the resolved ID is always returned in the response.',
  })
  @ApiResponse({ status: 201, type: ChatResponseDto })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiTooManyRequestsResponse({
    description: 'Rate limit exceeded (10 requests/minute per IP).',
  })
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
    description:
      'Shares the same conversation history, RAG, and check_order_status tool-calling behavior as POST /chat, but streams the answer.',
  })
  @ApiProduces('text/event-stream')
  @ApiResponse({
    status: 200,
    description:
      'text/event-stream. Emits a leading `event: session` message with the resolved session ID, followed by plain-text answer chunks, then a `data: [DONE]` event.',
  })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiTooManyRequestsResponse({
    description: 'Rate limit exceeded (10 requests/minute per IP).',
  })
  streamChat(
    @Query() query: ChatStreamQueryDto,
    @Query('sessionId') sessionId?: string,
  ): Observable<MessageEvent> {
    const activeSessionId =
      sessionId || this.conversationService.generateSessionId();
    return this.chatService.chatStream(query.question, activeSessionId);
  }
}
