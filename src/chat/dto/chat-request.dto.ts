import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ChatRequestDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  question: string;
}
