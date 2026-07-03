import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Faq } from './entities/faq.entity';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { FAQ_DATA } from './faq-data';

@Injectable()
export class FaqService {
  private embeddingModel;

  constructor(
    @InjectRepository(Faq)
    private faqRepository: Repository<Faq>,
  ) {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    this.embeddingModel = genAI.getGenerativeModel({
      model: 'gemini-embedding-001',
    });
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const result = await this.embeddingModel.embedContent(text);
    return result.embedding.values;
  }

  async seedFaqs() {
    await this.faqRepository.clear();
    for (const item of FAQ_DATA) {
      const embedding = await this.generateEmbedding(
        `${item.question} ${item.answer}`,
      );
      const faq = this.faqRepository.create({
        question: item.question,
        answer: item.answer,
        embedding: JSON.stringify(embedding),
      });
      await this.faqRepository.save(faq);
    }
  }

  async findRelevant(question: string, topK = 3): Promise<Faq[]> {
    const queryEmbedding = await this.generateEmbedding(question);
    const embeddingStr = `[${queryEmbedding.join(',')}]`;

    return this.faqRepository.query(
      `SELECT id, question, answer,
        1 - (embedding::vector <=> $1::vector) AS similarity
       FROM faq
       ORDER BY embedding::vector <=> $1::vector
       LIMIT $2`,
      [embeddingStr, topK],
    );
  }
}
