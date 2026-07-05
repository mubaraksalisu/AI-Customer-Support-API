import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Railway sits in front of this app as a single reverse-proxy hop.
  // Trusting exactly 1 hop (not `true`, which would trust the entire,
  // spoofable X-Forwarded-For chain) makes Express set req.ip to the real
  // client IP, which the rate limiter's default IP-based tracker relies on.
  app.set('trust proxy', 1);

  app.enableCors({
    origin: '*',
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('AI Customer Support')
    .setDescription(
      'RAG + tool-calling customer support chat API with per-session conversation history, backed by Google Gemini and pgvector.',
    )
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap().catch((error) => {
  new Logger('Bootstrap').error('Application failed to start', error);
  process.exit(1);
});
