import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Faq } from './entities/faq.entity';
import { GenerativeModel, GoogleGenerativeAI } from '@google/generative-ai';
import { FAQ_DATA } from './faq-data';

@Injectable()
export class FaqService {
  private readonly logger = new Logger(FaqService.name);
  private embeddingModel: GenerativeModel;

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
    try {
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
    } catch (error) {
      this.logger.error(
        `FAQ seeding failed: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw new InternalServerErrorException(
        'FAQ seeding failed. Check server logs for details.',
      );
    }
  }

  async findRelevant(question: string, topK = 3): Promise<Faq[]> {
    try {
      const queryEmbedding = await this.generateEmbedding(question);
      const embeddingStr = `[${queryEmbedding.join(',')}]`;

      return await this.faqRepository.query(
        `SELECT id, question, answer,
          1 - (embedding::vector <=> $1::vector) AS similarity
         FROM faq
         ORDER BY embedding::vector <=> $1::vector
         LIMIT $2`,
        [embeddingStr, topK],
      );
    } catch (error) {
      this.logger.error(
        `FAQ similarity search failed: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw error;
    }
  }
}
