import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConversationsService } from './conversations.service';
import { Conversation } from './entities/conversation.entity';

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('ConversationsService', () => {
  let service: ConversationsService;
  let repository: jest.Mocked<Repository<Conversation>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationsService,
        {
          provide: getRepositoryToken(Conversation),
          useValue: { create: jest.fn(), save: jest.fn(), find: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<ConversationsService>(ConversationsService);
    repository = module.get(getRepositoryToken(Conversation));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateSessionId', () => {
    it('returns a valid v4 UUID', () => {
      expect(service.generateSessionId()).toMatch(UUID_V4_REGEX);
    });

    it('returns a different id on each call', () => {
      const first = service.generateSessionId();
      const second = service.generateSessionId();

      expect(first).not.toEqual(second);
    });
  });

  describe('saveMessage', () => {
    it('creates and saves an entity built from the given fields', async () => {
      const created = {
        sessionId: 'session-1',
        role: 'user',
        content: 'Hello',
      };
      repository.create.mockReturnValue(created as Conversation);
      repository.save.mockResolvedValue(created as Conversation);

      await service.saveMessage('session-1', 'user', 'Hello');

      expect(repository.create).toHaveBeenCalledWith({
        sessionId: 'session-1',
        role: 'user',
        content: 'Hello',
      });
      expect(repository.save).toHaveBeenCalledWith(created);
    });

    it('passes through an empty content string as-is', async () => {
      repository.create.mockReturnValue({} as Conversation);
      repository.save.mockResolvedValue({} as Conversation);

      await service.saveMessage('session-1', 'user', '');

      expect(repository.create).toHaveBeenCalledWith({
        sessionId: 'session-1',
        role: 'user',
        content: '',
      });
    });

    it('resolves to undefined on success', async () => {
      repository.create.mockReturnValue({} as Conversation);
      repository.save.mockResolvedValue({} as Conversation);

      await expect(
        service.saveMessage('session-1', 'user', 'Hello'),
      ).resolves.toBeUndefined();
    });

    it('propagates an error when the repository fails to save', async () => {
      repository.create.mockReturnValue({} as Conversation);
      repository.save.mockRejectedValue(new Error('db unavailable'));

      await expect(
        service.saveMessage('session-1', 'user', 'Hello'),
      ).rejects.toThrow('db unavailable');
    });
  });

  describe('getHistory', () => {
    it('queries by sessionId ordered by createdAt ascending', async () => {
      repository.find.mockResolvedValue([]);

      await service.getHistory('session-1');

      expect(repository.find).toHaveBeenCalledWith({
        where: { sessionId: 'session-1' },
        order: { createdAt: 'ASC' },
      });
    });

    it('maps stored messages into Gemini-shaped history entries, preserving order', async () => {
      repository.find.mockResolvedValue([
        { id: 1, sessionId: 's', role: 'user', content: 'Hi' } as Conversation,
        {
          id: 2,
          sessionId: 's',
          role: 'model',
          content: 'Hello there',
        } as Conversation,
      ]);

      const history = await service.getHistory('session-1');

      expect(history).toEqual([
        { role: 'user', parts: [{ text: 'Hi' }] },
        { role: 'model', parts: [{ text: 'Hello there' }] },
      ]);
    });

    it('returns an empty array when there is no history for the session', async () => {
      repository.find.mockResolvedValue([]);

      const history = await service.getHistory('brand-new-session');

      expect(history).toEqual([]);
    });

    it('maps a message with empty content to an empty text part', async () => {
      repository.find.mockResolvedValue([
        { id: 1, sessionId: 's', role: 'user', content: '' } as Conversation,
      ]);

      const history = await service.getHistory('session-1');

      expect(history).toEqual([{ role: 'user', parts: [{ text: '' }] }]);
    });

    it('propagates an error when the repository query fails', async () => {
      repository.find.mockRejectedValue(new Error('db unavailable'));

      await expect(service.getHistory('session-1')).rejects.toThrow(
        'db unavailable',
      );
    });
  });
});
