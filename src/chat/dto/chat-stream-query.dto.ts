import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ChatStreamQueryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  question: string;
}
