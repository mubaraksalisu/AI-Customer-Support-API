import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { FaqService } from './faq.service';

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule);
  try {
    const faqService = app.get(FaqService);
    console.log('Seeding FAQ data...');
    await faqService.seedFaqs();
    console.log('FAQ seeding complete.');
  } finally {
    await app.close();
  }
}

run().catch((err) => {
  console.error('FAQ seeding failed:', err);
  process.exit(1);
});
