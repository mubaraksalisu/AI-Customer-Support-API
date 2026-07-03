import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

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
}
