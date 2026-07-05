import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { App } from 'supertest/types';
import { ChatController } from '../src/chat/chat.controller';
import { ChatService } from '../src/chat/chat.service';
import { ConversationsService } from '../src/conversations/conversations.service';

describe('Chat rate limiting (e2e)', () => {
  let app: INestApplication<App>;

  const chatServiceMock = {
    chat: jest.fn().mockResolvedValue({
      answer: 'mocked answer',
      confidence: 'high',
      tool_used: false,
      context_used: [],
    }),
    chatStream: jest.fn(),
  };

  const conversationServiceMock = {
    generateSessionId: jest.fn().mockReturnValue('mocked-session-id'),
  };

  // ChatController carries its own class-level @Throttle({ limit: 10, ttl: 60_000 }),
  // which takes precedence over whatever this module registers as the
  // "default" throttler config — so the module config below only needs to
  // be valid, not tight; the 10/60s limit actually enforced here is the real
  // production config from the controller decorator.
  const CHAT_ROUTE_LIMIT = 10;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 30 }])],
      controllers: [ChatController],
      providers: [
        { provide: ChatService, useValue: chatServiceMock },
        { provide: ConversationsService, useValue: conversationServiceMock },
        { provide: APP_GUARD, useClass: ThrottlerGuard },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('allows requests up to the limit, then returns 429', async () => {
    for (let i = 0; i < CHAT_ROUTE_LIMIT; i++) {
      await request(app.getHttpServer())
        .post('/chat')
        .send({ question: `Question ${i}` })
        .expect(201);
    }

    const res = await request(app.getHttpServer())
      .post('/chat')
      .send({ question: 'One over the limit' })
      .expect(429);

    expect((res.body as { message: string }).message).toContain(
      'Too Many Requests',
    );
  });
});
