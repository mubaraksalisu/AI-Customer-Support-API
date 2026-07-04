import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import { timingSafeEqual } from 'crypto';
import { FaqService } from './faq.service';

@Controller('faq')
export class FaqController {
  private readonly logger = new Logger(FaqController.name);

  constructor(private readonly faqService: FaqService) {}

  // Lets FAQ data be reseeded on hosts (Render/Railway free tiers, etc.)
  // where there's no shell access to run `npm run seed:faq` directly.
  @Post('seed')
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  async seed(@Headers('x-seed-secret') providedSecret?: string) {
    const expectedSecret = process.env.FAQ_SEED_SECRET;
    if (!expectedSecret || !isMatchingSecret(providedSecret, expectedSecret)) {
      this.logger.warn('Rejected FAQ seed request with invalid secret.');
      throw new UnauthorizedException();
    }

    await this.faqService.seedFaqs();
    this.logger.log('FAQ seeding complete.');
    return { message: 'FAQ seeding complete.' };
  }
}

function isMatchingSecret(
  provided: string | undefined,
  expected: string,
): boolean {
  if (!provided) return false;
  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(expected);
  if (providedBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(providedBuf, expectedBuf);
}
