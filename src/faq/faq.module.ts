import { Module } from '@nestjs/common';
import { FaqService } from './faq.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Faq } from './entities/faq.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Faq])],
  providers: [FaqService],
  exports: [FaqService],
})
export class FaqModule {}
