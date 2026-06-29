import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ChatModule } from './chat/chat.module';
import { FaqModule } from './faq/faq.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Faq } from './faq/entities/faq.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT!),
      username: process.env.DB_USER,
      password: process.env.DB_PASS,
      database: process.env.DB_NAME,
      entities: [Faq],
      synchronize: true, // fine for development, turn off in production
    }),
    ChatModule,
    FaqModule,
  ],
})
export class AppModule {}
