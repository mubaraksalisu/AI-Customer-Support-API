import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FaqService } from './faq.service';
import { Faq } from './entities/faq.entity';

const mockEmbedContent = jest.fn();

jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      embedContent: mockEmbedContent,
    }),
  })),
}));

describe('FaqService', () => {
  let service: FaqService;
  let repository: jest.Mocked<Repository<Faq>>;

  beforeEach(async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    mockEmbedContent.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FaqService,
        {
          provide: getRepositoryToken(Faq),
          useValue: {
            count: jest.fn(),
            create: jest.fn((data) => data),
            save: jest.fn(),
            query: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<FaqService>(FaqService);
    repository = module.get(getRepositoryToken(Faq));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('generates an embedding via the Gemini embedding model', async () => {
    mockEmbedContent.mockResolvedValue({
      embedding: { values: [0.1, 0.2, 0.3] },
    });

    const result = await service.generateEmbedding('some text');

    expect(mockEmbedContent).toHaveBeenCalledWith('some text');
    expect(result).toEqual([0.1, 0.2, 0.3]);
  });

  it('seeds FAQ data on module init when the table is empty', async () => {
    (repository.count as jest.Mock).mockResolvedValue(0);
    mockEmbedContent.mockResolvedValue({ embedding: { values: [0.1] } });

    await service.onModuleInit();

    expect(repository.save).toHaveBeenCalled();
  });

  it('does not reseed when FAQ data already exists', async () => {
    (repository.count as jest.Mock).mockResolvedValue(5);

    await service.onModuleInit();

    expect(repository.save).not.toHaveBeenCalled();
  });

  it('queries for the top-K most similar FAQs by embedding distance', async () => {
    mockEmbedContent.mockResolvedValue({ embedding: { values: [0.1, 0.2] } });
    const fakeRows = [{ id: 1, question: 'Q1', answer: 'A1', similarity: 0.9 }];
    (repository.query as jest.Mock).mockResolvedValue(fakeRows);

    const result = await service.findRelevant('some question', 3);

    expect(repository.query).toHaveBeenCalledWith(
      expect.stringContaining('ORDER BY embedding::vector <=> $1::vector'),
      ['[0.1,0.2]', 3],
    );
    expect(result).toEqual(fakeRows);
  });
});
