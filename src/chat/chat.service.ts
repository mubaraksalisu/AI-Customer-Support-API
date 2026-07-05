import { GoogleGenerativeAI, Tool } from '@google/generative-ai';
import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { systemPrompt, streamSystemPrompt } from './prompts';
import { FaqService } from '../faq/faq.service';
import { OrdersService } from '../orders/orders.service';
import { ChatResponseDto } from './dto/chat-response.dto';
import { ConversationsService } from '../conversations/conversations.service';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private readonly MAX_TOOL_ROUNDS = 5;
  private model;

  constructor(
    private readonly faqService: FaqService,
    private readonly ordersService: OrdersService,
    private readonly conversationService: ConversationsService,
  ) {
    const genAi = new GoogleGenerativeAI(process.env.GEMINI_API_KEY as string);
    const tools: Tool[] = [
      {
        functionDeclarations: [
          {
            name: 'check_order_status',
            description:
              'Looks up the status of a customer order by order number. Call this when the customer asks about their order status.',
            parameters: {
              type: 'object' as any,
              properties: {
                order_number: {
                  type: 'string' as any,
                  description: 'The order number e.g. ORD-001',
                },
              },
              required: ['order_number'],
            },
          },
        ],
      },
    ];

    this.model = genAi.getGenerativeModel({
      model: 'gemini-3.1-flash-lite',
      generationConfig: { temperature: 0.2 },
      tools,
      systemInstruction: systemPrompt,
    });
  }

  async chat(
    question: string,
    sessionId: string,
  ): Promise<Omit<ChatResponseDto, 'sessionId'>> {
    try {
      // 1. Retrieve FAQ context
      const relevantFaqs = await this.faqService.findRelevant(question, 3);
      const context = relevantFaqs.length
        ? relevantFaqs
            .map((f) => `Q: ${f.question}\nA: ${f.answer}`)
            .join('\n\n')
        : 'No relevant information found.';

      // 2. Fetch conversation history from DB
      const history = await this.conversationService.getHistory(sessionId);

      // 3. Build contents array: history + new message with context
      const currentPrompt = `CONTEXT:\n${context}\n\nCUSTOMER QUESTION:\n${question}`;
      const contents: any[] = [
        ...history,
        { role: 'user', parts: [{ text: currentPrompt }] },
      ];

      // 4. Save customer's message to DB
      await this.conversationService.saveMessage(sessionId, 'user', question);

      let toolWasUsed = false;

      for (let round = 0; round < this.MAX_TOOL_ROUNDS; round++) {
        const result = await this.model.generateContent({ contents });
        const candidate = result.response.candidates?.[0];
        const parts = candidate?.content?.parts ?? [];
        const toolCallParts = parts.filter((p) => p.functionCall);

        if (toolCallParts.length === 0) {
          const raw = result.response.text();

          // 5. Save model's reply to DB
          const parsed = this.parseResponse(raw, relevantFaqs, toolWasUsed);
          await this.conversationService.saveMessage(
            sessionId,
            'model',
            parsed['answer'] as string,
          );

          return parsed;
        }

        toolWasUsed = true;
        contents.push(candidate.content);

        const functionResponseParts: any = [];
        for (const part of toolCallParts) {
          const { name, args } = part.functionCall;
          const toolResult = await this.executeTool(name, args);
          functionResponseParts.push({
            functionResponse: { name, response: toolResult },
          });
        }

        contents.push({ role: 'user', parts: functionResponseParts });
      }

      return this.parseResponse(
        '<answer>I was unable to process your request.</answer><confidence>low</confidence>',
        relevantFaqs,
        toolWasUsed,
      );
    } catch (error) {
      this.logger.error(
        `Failed to answer chat question: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw new ServiceUnavailableException(
        'Unable to process your question right now. Please try again shortly.',
      );
    }
  }

  private async executeTool(name: string, args: any): Promise<any> {
    if (name === 'check_order_status') {
      const order = await this.ordersService.getOrderStatus(args.order_number);
      return order ?? { error: 'Order not found' };
    }

    this.logger.warn(`Model requested unknown tool: ${name}`);
    return { error: `Unknown tool: ${name}` };
  }

  private parseResponse(
    raw: string,
    faqs: any[],
    toolUsed: boolean,
  ): Omit<ChatResponseDto, 'sessionId'> {
    const answer =
      raw.match(/<answer>([\s\S]*?)<\/answer>/)?.[1]?.trim() ??
      "I don't have that information. Please contact us directly for help.";

    const confidence = (
      raw.match(/<confidence>([\s\S]*?)<\/confidence>/)?.[1]?.trim() === 'high'
        ? 'high'
        : 'low'
    ) as 'high' | 'low';

    return {
      answer,
      confidence,
      tool_used: toolUsed,
      context_used: faqs.map((f) => f.question),
    };
  }

  chatStream(question: string, sessionId: string): Observable<MessageEvent> {
    return new Observable((subscriber) => {
      this.streamResponse(question, sessionId, subscriber);
    });
  }

  private async forwardTextChunks(
    stream: AsyncGenerator<any>,
    subscriber: any,
  ): Promise<{
    text: string;
    content?: any;
    functionCall?: { name: string; args: any };
  }> {
    let text = '';
    for await (const chunk of stream) {
      const content = chunk.candidates?.[0]?.content;
      const toolPart = content?.parts?.find((p: any) => p.functionCall);
      if (toolPart) {
        return { text, content, functionCall: toolPart.functionCall };
      }

      const chunkText = chunk.text();
      if (chunkText) {
        subscriber.next({ data: chunkText } as MessageEvent);
        text += chunkText;
      }
    }
    return { text };
  }

  private async streamResponse(
    question: string,
    sessionId: string,
    subscriber: any,
  ) {
    try {
      subscriber.next({ data: sessionId, type: 'session' } as MessageEvent);

      // 1. Retrieve FAQ context
      const relevantFaqs = await this.faqService.findRelevant(question, 3);
      const context = relevantFaqs.length
        ? relevantFaqs
            .map((f) => `Q: ${f.question}\nA: ${f.answer}`)
            .join('\n\n')
        : 'No relevant information found.';

      // 2. Fetch conversation history from DB
      const history = await this.conversationService.getHistory(sessionId);

      // 3. Build contents array: history + new message with context
      const currentPrompt = `CONTEXT:\n${context}\n\nCUSTOMER QUESTION:\n${question}`;
      const contents: any[] = [
        ...history,
        { role: 'user', parts: [{ text: currentPrompt }] },
      ];

      // 4. Save customer's message to DB
      await this.conversationService.saveMessage(sessionId, 'user', question);

      let answerText = '';
      let finished = false;

      for (let round = 0; round < this.MAX_TOOL_ROUNDS; round++) {
        const result = await this.model.generateContentStream({
          contents,
          systemInstruction: streamSystemPrompt,
        });

        const outcome = await this.forwardTextChunks(
          result.stream,
          subscriber,
        );
        answerText += outcome.text;

        if (!outcome.functionCall) {
          finished = true;
          break;
        }

        contents.push(outcome.content);

        const { name, args } = outcome.functionCall;
        const toolResult = await this.executeTool(name, args);
        contents.push({
          role: 'user',
          parts: [{ functionResponse: { name, response: toolResult } }],
        });
      }

      if (!finished) {
        const fallback = 'I was unable to process your request.';
        subscriber.next({ data: fallback } as MessageEvent);
        answerText += fallback;
      }

      // 5. Save model's reply to DB
      await this.conversationService.saveMessage(
        sessionId,
        'model',
        answerText,
      );

      subscriber.next({ data: '[DONE]' } as MessageEvent);
      subscriber.complete();
    } catch (error) {
      this.logger.error(
        `Failed to stream chat answer: ${(error as Error).message}`,
        (error as Error).stack,
      );
      subscriber.error(
        new Error(
          'Unable to process your question right now. Please try again shortly.',
        ),
      );
    }
  }
}
