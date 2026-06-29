import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Faq } from './entities/faq.entity';
import { GoogleGenerativeAI } from '@google/generative-ai';

const FAQ_DATA = [
  {
    question: 'What are your delivery options?',
    answer:
      'We offer standard delivery (3-5 business days) and express delivery (next day). Both are available at checkout.',
  },
  {
    question: 'How do I return a product?',
    answer:
      'We accept returns within 14 days of purchase. Items must be unused and in original packaging. Contact us to initiate a return.',
  },
  {
    question: 'What payment methods do you accept?',
    answer: 'We accept bank transfer, card payments, and cash on delivery.',
  },
  {
    question: 'How do I track my order?',
    answer:
      'Once your order ships, you will receive a tracking link via email or WhatsApp.',
  },
  {
    question: 'Do you offer bulk discounts?',
    answer:
      'Yes, we offer discounts for orders above 10 units. Contact us directly to discuss pricing.',
  },
  {
    question: 'What are your business hours?',
    answer: 'We are open Monday to Saturday, 8am to 6pm WAT.',
  },
  {
    question: 'Can I change my order after placing it?',
    answer:
      'You can change your order within 1 hour of placing it. After that, it may already be processing.',
  },
  {
    question: 'Do you deliver outside Nigeria?',
    answer:
      'Currently we only deliver within Nigeria. International shipping is coming soon.',
  },
];

@Injectable()
export class FaqService implements OnModuleInit {
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

  async onModuleInit() {
    const count = await this.faqRepository.count();
    if (count === 0) {
      console.log('Seeding FAQ data...');
      await this.seedFaqs();
      console.log('FAQ seeding complete.');
    }
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const result = await this.embeddingModel.embedContent(text);
    return result.embedding.values;
  }

  async seedFaqs() {
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
