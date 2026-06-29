import { GoogleGenerativeAI } from '@google/generative-ai';
import { Injectable } from '@nestjs/common';
import { systemPrompt } from 'src/chat/prompts';
import { FaqService } from 'src/faq/faq.service';

@Injectable()
export class ChatService {
  private model;

  constructor(private readonly faqService: FaqService) {
    const genAi = new GoogleGenerativeAI(process.env.GEMINI_API_KEY as string);
    this.model = genAi.getGenerativeModel({
      model: 'gemini-3.1-flash-lite',
      systemInstruction: systemPrompt,
    });
  }

  async chat(
    question: string,
  ): Promise<{ answer: string; confidence: string; context_used: string[] }> {
    // 1. Retrieve relevant FAQ entries
    const relevantFaqs = await this.faqService.findRelevant(question, 3);

    // 2. Build context string from retrieved FAQs
    const context = relevantFaqs.length
      ? relevantFaqs.map((f) => `Q: ${f.question}\nA: ${f.answer}`).join('\n\n')
      : 'No relevant information found.';

    // 3. Inject context into the prompt
    const prompt = `
    CONTEXT:
    ${context}

    CUSTOMER QUESTION:
    ${question}`;

    const result = await this.model.generateContent(prompt);
    const raw = result.response.text();

    const answer =
      raw.match(/<answer>([\s\S]*?)<\/answer>/)?.[1]?.trim() ??
      "I don't have that information. Please contact us directly for help.";

    const confidence =
      raw.match(/<confidence>([\s\S]*?)<\/confidence>/)?.[1]?.trim() ?? 'low';

    return {
      answer,
      confidence,
      context_used: relevantFaqs.map((f) => f.question),
    };
  }
}
