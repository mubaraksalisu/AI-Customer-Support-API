import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { ChatController } from '../src/chat/chat.controller';
import { ChatService } from '../src/chat/chat.service';

describe('Chat validation (e2e)', () => {
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

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [ChatController],
      providers: [{ provide: ChatService, useValue: chatServiceMock }],
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

  afterEach(() => {
    chatServiceMock.chat.mockClear();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /chat accepts a valid question', () => {
    return request(app.getHttpServer())
      .post('/chat')
      .send({ question: 'What are your business hours?' })
      .expect(201)
      .expect((res) => {
        expect(res.body.answer).toBe('mocked answer');
      });
  });

  it('POST /chat rejects a missing question', () => {
    return request(app.getHttpServer()).post('/chat').send({}).expect(400);
  });

  it('POST /chat rejects an empty question', () => {
    return request(app.getHttpServer())
      .post('/chat')
      .send({ question: '' })
      .expect(400);
  });

  it('POST /chat rejects a non-string question', () => {
    return request(app.getHttpServer())
      .post('/chat')
      .send({ question: 12345 })
      .expect(400);
  });

  it('POST /chat rejects a question over the length limit', () => {
    return request(app.getHttpServer())
      .post('/chat')
      .send({ question: 'a'.repeat(2001) })
      .expect(400);
  });

  it('POST /chat rejects unknown fields', () => {
    return request(app.getHttpServer())
      .post('/chat')
      .send({ question: 'valid question', extra: 'not allowed' })
      .expect(400);
  });

  it('never reaches the service when validation fails', async () => {
    await request(app.getHttpServer()).post('/chat').send({}).expect(400);
    expect(chatServiceMock.chat).not.toHaveBeenCalled();
  });
});
