import { Test, TestingModule } from '@nestjs/testing';
import { ChatService } from './chat.service';
import { FaqService } from '../faq/faq.service';
import { OrdersService } from '../orders/orders.service';

const mockGenerateContent = jest.fn();
const mockGenerateContentStream = jest.fn();

jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContent: mockGenerateContent,
      generateContentStream: mockGenerateContentStream,
    }),
  })),
}));

describe('ChatService', () => {
  let service: ChatService;
  let faqService: jest.Mocked<FaqService>;
  let ordersService: jest.Mocked<OrdersService>;

  beforeEach(async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    mockGenerateContent.mockReset();
    mockGenerateContentStream.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: FaqService, useValue: { findRelevant: jest.fn() } },
        { provide: OrdersService, useValue: { getOrderStatus: jest.fn() } },
      ],
    }).compile();

    service = module.get<ChatService>(ChatService);
    faqService = module.get(FaqService);
    ordersService = module.get(OrdersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('parses the answer and confidence when no tool call is made', async () => {
    faqService.findRelevant.mockResolvedValue([]);
    mockGenerateContent.mockResolvedValue({
      response: {
        candidates: [{ content: { parts: [{ text: 'irrelevant' }] } }],
        text: () => '<answer>Hi there</answer><confidence>high</confidence>',
      },
    });

    const result = await service.chat('Hello');

    expect(result).toEqual({
      answer: 'Hi there',
      confidence: 'high',
      tool_used: false,
      context_used: [],
    });
  });

  it('includes retrieved FAQ questions in context_used', async () => {
    faqService.findRelevant.mockResolvedValue([
      { id: 1, question: 'What are your hours?', answer: '9-5', embedding: '' },
    ] as any);
    mockGenerateContent.mockResolvedValue({
      response: {
        candidates: [{ content: { parts: [{ text: 'irrelevant' }] } }],
        text: () => '<answer>9-5</answer><confidence>high</confidence>',
      },
    });

    const result: any = await service.chat('What are your hours?');

    expect(result.context_used).toEqual(['What are your hours?']);
  });

  it('calls check_order_status and answers using the tool result', async () => {
    faqService.findRelevant.mockResolvedValue([]);
    ordersService.getOrderStatus.mockResolvedValue({
      orderNumber: 'ORD-001',
      status: 'shipped',
    } as any);

    const toolCallContent = {
      parts: [
        {
          functionCall: {
            name: 'check_order_status',
            args: { order_number: 'ORD-001' },
          },
        },
      ],
    };

    mockGenerateContent
      .mockResolvedValueOnce({
        response: { candidates: [{ content: toolCallContent }], text: () => '' },
      })
      .mockResolvedValueOnce({
        response: {
          text: () =>
            '<answer>Your order has shipped.</answer><confidence>high</confidence>',
        },
      });

    const result = await service.chat("What's the status of ORD-001?");

    expect(ordersService.getOrderStatus).toHaveBeenCalledWith('ORD-001');
    expect(result).toEqual({
      answer: 'Your order has shipped.',
      confidence: 'high',
      tool_used: true,
      context_used: [],
    });
  });

  it('falls back gracefully when the tool reports the order was not found', async () => {
    faqService.findRelevant.mockResolvedValue([]);
    ordersService.getOrderStatus.mockResolvedValue(null);

    const toolCallContent = {
      parts: [
        {
          functionCall: {
            name: 'check_order_status',
            args: { order_number: 'ORD-999' },
          },
        },
      ],
    };

    mockGenerateContent
      .mockResolvedValueOnce({
        response: { candidates: [{ content: toolCallContent }], text: () => '' },
      })
      .mockResolvedValueOnce({
        response: {
          text: () =>
            '<answer>I could not find that order.</answer><confidence>low</confidence>',
        },
      });

    const result = await service.chat('Status of ORD-999?');

    expect(result).toEqual({
      answer: 'I could not find that order.',
      confidence: 'low',
      tool_used: true,
      context_used: [],
    });
  });

  it('defaults to the fallback answer and low confidence when tags are missing', async () => {
    faqService.findRelevant.mockResolvedValue([]);
    mockGenerateContent.mockResolvedValue({
      response: { candidates: [], text: () => 'unstructured text with no tags' },
    });

    const result = await service.chat('gibberish');

    expect(result).toEqual({
      answer: "I don't have that information. Please contact us directly for help.",
      confidence: 'low',
      tool_used: false,
      context_used: [],
    });
  });

  it('streams chunks and emits [DONE] on completion', async () => {
    faqService.findRelevant.mockResolvedValue([]);

    async function* fakeStream() {
      yield { text: () => 'Hello ' };
      yield { text: () => 'world' };
    }
    mockGenerateContentStream.mockResolvedValue({ stream: fakeStream() });

    const events: any[] = [];
    await new Promise<void>((resolve, reject) => {
      service.chatStream('Hi').subscribe({
        next: (event) => events.push(event),
        error: reject,
        complete: resolve,
      });
    });

    expect(events).toEqual([
      { data: 'Hello ' },
      { data: 'world' },
      { data: '[DONE]' },
    ]);
  });

  it('propagates stream errors to the observable', async () => {
    faqService.findRelevant.mockResolvedValue([]);
    mockGenerateContentStream.mockRejectedValue(new Error('boom'));

    await expect(
      new Promise((resolve, reject) => {
        service.chatStream('Hi').subscribe({
          next: () => undefined,
          error: reject,
          complete: () => resolve(undefined),
        });
      }),
    ).rejects.toThrow('boom');
  });
});
