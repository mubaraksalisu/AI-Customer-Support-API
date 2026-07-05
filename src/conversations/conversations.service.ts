import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Conversation } from './entities/conversation.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';

@Injectable()
export class ConversationsService {
  constructor(
    @InjectRepository(Conversation)
    private conversationRepository: Repository<Conversation>,
  ) {}

  generateSessionId(): string {
    return randomUUID();
  }

  async saveMessage(
    sessionId: string,
    role: string,
    content: string,
  ): Promise<void> {
    const message = this.conversationRepository.create({
      sessionId,
      role,
      content,
    });
    await this.conversationRepository.save(message);
  }

  async getHistory(
    sessionId: string,
  ): Promise<{ role: string; parts: { text: string }[] }[]> {
    const messages = await this.conversationRepository.find({
      where: { sessionId },
      order: { createdAt: 'ASC' },
    });

    // Format history the way Gemini expects it
    return messages.map((m) => ({
      role: m.role,
      parts: [{ text: m.content }],
    }));
  }
}
