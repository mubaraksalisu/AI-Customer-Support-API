import { Test, TestingModule } from '@nestjs/testing';
import { ChatService } from './chat.service';
import { FaqService } from '../faq/faq.service';
import { OrdersService } from '../orders/orders.service';
import { ConversationsService } from '../conversations/conversations.service';
import { streamSystemPrompt } from './prompts';

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
  let conversationService: jest.Mocked<ConversationsService>;

  beforeEach(async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    mockGenerateContent.mockReset();
    mockGenerateContentStream.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: FaqService, useValue: { findRelevant: jest.fn() } },
        { provide: OrdersService, useValue: { getOrderStatus: jest.fn() } },
        {
          provide: ConversationsService,
          useValue: {
            getHistory: jest.fn().mockResolvedValue([]),
            saveMessage: jest.fn().mockResolvedValue(undefined),
            generateSessionId: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ChatService>(ChatService);
    faqService = module.get(FaqService);
    ordersService = module.get(OrdersService);
    conversationService = module.get(ConversationsService);
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

    const result = await service.chat('Hello', 'session-1');

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

    const result: any = await service.chat('What are your hours?', 'session-1');

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

    const result = await service.chat(
      "What's the status of ORD-001?",
      'session-1',
    );

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

    const result = await service.chat('Status of ORD-999?', 'session-1');

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

    const result = await service.chat('gibberish', 'session-1');

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
      service.chatStream('Hi', 'session-1').subscribe({
        next: (event) => events.push(event),
        error: reject,
        complete: resolve,
      });
    });

    expect(events).toEqual([
      { data: 'session-1', type: 'session' },
      { data: 'Hello ' },
      { data: 'world' },
      { data: '[DONE]' },
    ]);
    expect(conversationService.saveMessage).toHaveBeenCalledWith(
      'session-1',
      'user',
      'Hi',
    );
    expect(conversationService.saveMessage).toHaveBeenCalledWith(
      'session-1',
      'model',
      'Hello world',
    );
  });

  it('overrides the system instruction so streamed output has no XML tags', async () => {
    faqService.findRelevant.mockResolvedValue([]);

    async function* fakeStream() {
      yield { text: () => 'plain answer text' };
    }
    mockGenerateContentStream.mockResolvedValue({ stream: fakeStream() });

    await new Promise<void>((resolve, reject) => {
      service.chatStream('Hi', 'session-1').subscribe({
        next: () => undefined,
        error: reject,
        complete: resolve,
      });
    });

    expect(mockGenerateContentStream).toHaveBeenCalledWith(
      expect.objectContaining({ systemInstruction: streamSystemPrompt }),
    );
  });

  it('executes check_order_status mid-stream and streams the follow-up answer', async () => {
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

    async function* toolCallStream() {
      yield { candidates: [{ content: toolCallContent }], text: () => '' };
    }
    async function* answerStream() {
      yield { text: () => 'Your order has shipped.' };
    }

    mockGenerateContentStream
      .mockResolvedValueOnce({ stream: toolCallStream() })
      .mockResolvedValueOnce({ stream: answerStream() });

    const events: any[] = [];
    await new Promise<void>((resolve, reject) => {
      service
        .chatStream("What's the status of ORD-001?", 'session-1')
        .subscribe({
          next: (event) => events.push(event),
          error: reject,
          complete: resolve,
        });
    });

    expect(ordersService.getOrderStatus).toHaveBeenCalledWith('ORD-001');
    expect(mockGenerateContentStream).toHaveBeenCalledTimes(2);
    expect(events).toEqual([
      { data: 'session-1', type: 'session' },
      { data: 'Your order has shipped.' },
      { data: '[DONE]' },
    ]);
  });

  it('falls back gracefully when the streamed tool reports the order was not found', async () => {
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

    async function* toolCallStream() {
      yield { candidates: [{ content: toolCallContent }], text: () => '' };
    }
    async function* answerStream() {
      yield { text: () => 'I could not find that order.' };
    }

    mockGenerateContentStream
      .mockResolvedValueOnce({ stream: toolCallStream() })
      .mockResolvedValueOnce({ stream: answerStream() });

    const events: any[] = [];
    await new Promise<void>((resolve, reject) => {
      service.chatStream('Status of ORD-999?', 'session-1').subscribe({
        next: (event) => events.push(event),
        error: reject,
        complete: resolve,
      });
    });

    expect(events).toEqual([
      { data: 'session-1', type: 'session' },
      { data: 'I could not find that order.' },
      { data: '[DONE]' },
    ]);
  });

  it('propagates stream errors to the observable', async () => {
    faqService.findRelevant.mockResolvedValue([]);
    mockGenerateContentStream.mockRejectedValue(new Error('boom'));

    await expect(
      new Promise((resolve, reject) => {
        service.chatStream('Hi', 'session-1').subscribe({
          next: () => undefined,
          error: reject,
          complete: () => resolve(undefined),
        });
      }),
    ).rejects.toThrow(
      'Unable to process your question right now. Please try again shortly.',
    );
  });

  it('merges conversation history into the streamed contents', async () => {
    faqService.findRelevant.mockResolvedValue([]);
    conversationService.getHistory.mockResolvedValue([
      { role: 'user', parts: [{ text: 'previous question' }] },
      { role: 'model', parts: [{ text: 'previous answer' }] },
    ]);

    async function* fakeStream() {
      yield { text: () => 'follow-up answer' };
    }
    mockGenerateContentStream.mockResolvedValue({ stream: fakeStream() });

    await new Promise<void>((resolve, reject) => {
      service.chatStream('Follow-up question', 'session-1').subscribe({
        next: () => undefined,
        error: reject,
        complete: resolve,
      });
    });

    expect(conversationService.getHistory).toHaveBeenCalledWith('session-1');
    expect(mockGenerateContentStream).toHaveBeenCalledWith(
      expect.objectContaining({
        contents: expect.arrayContaining([
          { role: 'user', parts: [{ text: 'previous question' }] },
          { role: 'model', parts: [{ text: 'previous answer' }] },
        ]),
      }),
    );
  });

  it('loops through multiple tool-call rounds while streaming, like chat() does', async () => {
    faqService.findRelevant.mockResolvedValue([]);
    ordersService.getOrderStatus
      .mockResolvedValueOnce({ orderNumber: 'ORD-001', status: 'shipped' } as any)
      .mockResolvedValueOnce({ orderNumber: 'ORD-002', status: 'delivered' } as any);

    const toolCall = (orderNumber: string) => ({
      parts: [
        {
          functionCall: {
            name: 'check_order_status',
            args: { order_number: orderNumber },
          },
        },
      ],
    });

    async function* toolCallStream(orderNumber: string) {
      yield { candidates: [{ content: toolCall(orderNumber) }], text: () => '' };
    }
    async function* answerStream() {
      yield { text: () => 'Both orders found.' };
    }

    mockGenerateContentStream
      .mockResolvedValueOnce({ stream: toolCallStream('ORD-001') })
      .mockResolvedValueOnce({ stream: toolCallStream('ORD-002') })
      .mockResolvedValueOnce({ stream: answerStream() });

    const events: any[] = [];
    await new Promise<void>((resolve, reject) => {
      service
        .chatStream('Check ORD-001 and ORD-002', 'session-1')
        .subscribe({
          next: (event) => events.push(event),
          error: reject,
          complete: resolve,
        });
    });

    expect(ordersService.getOrderStatus).toHaveBeenCalledTimes(2);
    expect(mockGenerateContentStream).toHaveBeenCalledTimes(3);
    expect(events).toEqual([
      { data: 'session-1', type: 'session' },
      { data: 'Both orders found.' },
      { data: '[DONE]' },
    ]);
    expect(conversationService.saveMessage).toHaveBeenCalledWith(
      'session-1',
      'model',
      'Both orders found.',
    );
  });

  it('emits a fallback answer and saves it when tool rounds are exhausted', async () => {
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

    async function* toolCallStream() {
      yield { candidates: [{ content: toolCallContent }], text: () => '' };
    }

    mockGenerateContentStream.mockImplementation(() =>
      Promise.resolve({ stream: toolCallStream() }),
    );

    const events: any[] = [];
    await new Promise<void>((resolve, reject) => {
      service.chatStream('Loop forever?', 'session-1').subscribe({
        next: (event) => events.push(event),
        error: reject,
        complete: resolve,
      });
    });

    expect(mockGenerateContentStream).toHaveBeenCalledTimes(5);
    expect(events).toEqual([
      { data: 'session-1', type: 'session' },
      { data: 'I was unable to process your request.' },
      { data: '[DONE]' },
    ]);
    expect(conversationService.saveMessage).toHaveBeenCalledWith(
      'session-1',
      'model',
      'I was unable to process your request.',
    );
  });
});
