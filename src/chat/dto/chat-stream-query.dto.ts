import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ChatStreamQueryDto {
  @ApiProperty({
    description: 'The customer question for the support agent to answer.',
    example: 'What are your delivery options?',
    maxLength: 2000,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  question: string;

  @ApiPropertyOptional({
    description:
      'The session ID to continue an existing conversation. Omit to start a new one.',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsOptional()
  @IsString()
  sessionId?: string;
}
