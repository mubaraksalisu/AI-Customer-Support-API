import { GoogleGenerativeAI, Tool } from '@google/generative-ai';
import { Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';
import { systemPrompt, streamSystemPrompt } from './prompts';
import { FaqService } from '../faq/faq.service';
import { OrdersService } from '../orders/orders.service';
import { ChatResponseDto } from './dto/chat-response.dto';

@Injectable()
export class ChatService {
  private model;

  constructor(
    private readonly faqService: FaqService,
    private readonly ordersService: OrdersService,
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
      tools,
      systemInstruction: systemPrompt,
    });
  }

  async chat(question: string): Promise<ChatResponseDto> {
    // 1. Retrieve relevant FAQ entries
    const relevantFaqs = await this.faqService.findRelevant(question, 3);

    // 2. Build context string from retrieved FAQs
    const context = relevantFaqs.length
      ? relevantFaqs.map((f) => `Q: ${f.question}\nA: ${f.answer}`).join('\n\n')
      : 'No relevant information found.';

    // 3. Inject context into the prompt
    const prompt = `CONTEXT:\n${context}\n\nCUSTOMER QUESTION:\n${question}`;

    // 2. First model call — model may respond or request a tool call
    const result = await this.model.generateContent(prompt);
    const response = result.response;
    const candidate = response.candidates?.[0];
    const parts = candidate?.content?.parts ?? [];

    // 3. Check if model wants to call a tool
    const toolCallPart = parts.find((p) => p.functionCall);

    if (toolCallPart?.functionCall) {
      const { name, args } = toolCallPart.functionCall;

      // 4. Execute the real function
      let toolResult: any;
      if (name === 'check_order_status') {
        const order = await this.ordersService.getOrderStatus(
          args.order_number,
        );
        toolResult = order ?? { error: 'Order not found' };
      }

      // 5. Send tool result back to model for final answer
      const finalResult = await this.model.generateContent({
        contents: [
          { role: 'user', parts: [{ text: prompt }] },
          candidate.content,
          {
            role: 'user',
            parts: [
              {
                functionResponse: {
                  name,
                  response: toolResult,
                },
              },
            ],
          },
        ],
      });

      const raw = finalResult.response.text();
      return this.parseResponse(raw, relevantFaqs, true);
    }

    // 6. No tool call — parse regular response
    const raw = response.text();
    return this.parseResponse(raw, relevantFaqs, false);
  }

  private parseResponse(
    raw: string,
    faqs: any[],
    toolUsed: boolean,
  ): ChatResponseDto {
    const answer =
      raw.match(/<answer>([\s\S]*?)<\/answer>/)?.[1]?.trim() ??
      "I don't have that information. Please contact us directly for help.";

    const confidence = (raw.match(/<confidence>([\s\S]*?)<\/confidence>/)?.[1]?.trim() ===
    'high'
      ? 'high'
      : 'low') as 'high' | 'low';

    return {
      answer,
      confidence,
      tool_used: toolUsed,
      context_used: faqs.map((f) => f.question),
    };
  }

  chatStream(question: string): Observable<MessageEvent> {
    return new Observable((subscriber) => {
      this.streamResponse(question, subscriber);
    });
  }

  private async streamResponse(question: string, subscriber: any) {
    try {
      const relevantFaqs = await this.faqService.findRelevant(question, 3);
      const context = relevantFaqs.length
        ? relevantFaqs
            .map((f) => `Q: ${f.question}\nA: ${f.answer}`)
            .join('\n\n')
        : 'No relevant information found.';

      const prompt = `CONTEXT:\n${context}\n\nCUSTOMER QUESTION:\n${question}`;

      const result = await this.model.generateContentStream({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        systemInstruction: streamSystemPrompt,
      });

      for await (const chunk of result.stream) {
        const text = chunk.text();
        if (text) {
          subscriber.next({ data: text } as MessageEvent);
        }
      }

      subscriber.next({ data: '[DONE]' } as MessageEvent);
      subscriber.complete();
    } catch (error) {
      subscriber.error(error);
    }
  }
}
