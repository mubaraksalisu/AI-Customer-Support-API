import { GoogleGenerativeAI } from '@google/generative-ai';
import { Injectable } from '@nestjs/common';
import { systemPrompt } from 'src/chat/prompts';

@Injectable()
export class ChatService {
  private model;

  constructor() {
    const genAi = new GoogleGenerativeAI(process.env.GEMINI_API_KEY as string);
    this.model = genAi.getGenerativeModel({
      model: 'gemini-3.1-flash-lite',
      systemInstruction: systemPrompt,
    });
  }

  async chat(
    question: string,
  ): Promise<{ answer: string; confidence: string }> {
    const result = await this.model.generateContent(question);
    const raw = result.response.text();

    const answer =
      raw.match(/<answer>([\s\S]*?)<\/answer>/)?.[1]?.trim() ??
      "I don't have that information. Please contact us directly for help.";

    const confidence =
      raw.match(/<confidence>([\s\S]*?)<\/confidence>/)?.[1]?.trim() ?? 'low';

    return { answer, confidence };
  }
}
