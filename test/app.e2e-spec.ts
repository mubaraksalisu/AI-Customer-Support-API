import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { Order } from '../src/orders/entities/order.entity';
import { FaqService } from '../src/faq/faq.service';
import { ChatResponseDto } from '../src/chat/dto/chat-response.dto';

const mockEmbedContent = jest.fn();
const mockGenerateContent = jest.fn();
const mockGenerateContentStream = jest.fn();

jest.mock('@google/generative-ai', () => ({
  ...jest.requireActual<typeof import('@google/generative-ai')>(
    '@google/generative-ai',
  ),
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest
      .fn()
      .mockImplementation(({ model }: { model: string }) => {
        if (model === 'gemini-embedding-001') {
          return { embedContent: mockEmbedContent };
        }
        return {
          generateContent: mockGenerateContent,
          generateContentStream: mockGenerateContentStream,
        };
      }),
  })),
}));

/**
 * Full-stack e2e test: boots the real AppModule against the real Postgres +
 * pgvector instance from docker-compose.yml. Only the Gemini SDK is mocked,
 * so this exercises real TypeORM wiring, the real pgvector similarity query,
 * and the real orders lookup — everything except the external LLM call.
 *
 * Requires `docker compose up -d` to be running first.
 */
describe('AI Chat Bot (e2e)', () => {
  let app: INestApplication<App>;
  let orderRepository: Repository<Order>;

  beforeAll(async () => {
    mockEmbedContent.mockResolvedValue({
      embedding: { values: [0.1, 0.2, 0.3, 0.4] },
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    orderRepository = moduleFixture.get(getRepositoryToken(Order));

    // Reset to a known state so this test doesn't depend on whatever is
    // already in the shared dev database.
    await orderRepository.query('DELETE FROM orders');

    await app.init();

    // FAQ seeding is decoupled from app bootstrap (see `npm run seed:faq` /
    // POST /faq/seed) so it must be triggered explicitly here, using the
    // mocked embeddings.
    await moduleFixture.get(FaqService).seedFaqs();

    await orderRepository.save(
      orderRepository.create({
        orderNumber: 'ORD-E2E-1',
        customerName: 'Test Customer',
        status: 'shipped',
        item: 'Widget',
      }),
    );
  });

  afterEach(() => {
    mockGenerateContent.mockReset();
    mockGenerateContentStream.mockReset();
  });

  afterAll(async () => {
    await app.close();
  });

  it('answers using FAQ context retrieved via pgvector', async () => {
    mockGenerateContent.mockResolvedValue({
      response: {
        candidates: [{ content: { parts: [{ text: 'irrelevant' }] } }],
        text: () =>
          '<answer>We are open Monday to Saturday, 8am to 6pm WAT.</answer><confidence>high</confidence>',
      },
    });

    const res = await request(app.getHttpServer())
      .post('/chat')
      .send({ question: 'What are your business hours?' })
      .expect(201);

    expect(res.body).toEqual({
      answer: 'We are open Monday to Saturday, 8am to 6pm WAT.',
      confidence: 'high',
      tool_used: false,
      context_used: expect.any(Array),
      sessionId: expect.any(String),
    });
    const body = res.body as ChatResponseDto;
    expect(body.context_used.length).toBeGreaterThan(0);
  });

  it('executes check_order_status against the real orders table', async () => {
    const toolCallContent = {
      parts: [
        {
          functionCall: {
            name: 'check_order_status',
            args: { order_number: 'ORD-E2E-1' },
          },
        },
      ],
    };

    mockGenerateContent
      .mockResolvedValueOnce({
        response: {
          candidates: [{ content: toolCallContent }],
          text: () => '',
        },
      })
      .mockResolvedValueOnce({
        response: {
          text: () =>
            '<answer>Your order has shipped.</answer><confidence>high</confidence>',
        },
      });

    const res = await request(app.getHttpServer())
      .post('/chat')
      .send({ question: "What's the status of ORD-E2E-1?" })
      .expect(201);

    expect(res.body).toEqual({
      answer: 'Your order has shipped.',
      confidence: 'high',
      tool_used: true,
      context_used: expect.any(Array),
      sessionId: expect.any(String),
    });
  });

  it('rejects invalid input via the global ValidationPipe', () => {
    return request(app.getHttpServer()).post('/chat').send({}).expect(400);
  });

  it('streams an answer over /chat/stream', async () => {
    function* fakeStream() {
      yield { text: () => 'Hello ' };
      yield { text: () => 'world' };
    }
    mockGenerateContentStream.mockResolvedValue({ stream: fakeStream() });

    const res = await request(app.getHttpServer())
      .get('/chat/stream')
      .query({ question: 'hi' })
      .expect(200);

    expect(res.text).toContain('data: Hello');
    expect(res.text).toContain('data: world');
    expect(res.text).toContain('data: [DONE]');
  });
});
