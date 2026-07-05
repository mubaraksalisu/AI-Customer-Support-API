import { ApiProperty } from '@nestjs/swagger';

export class ChatResponseDto {
  @ApiProperty({
    description: 'The agent answer to the customer question.',
    example: 'We are open Monday to Saturday, 8am to 6pm WAT.',
  })
  answer: string;

  @ApiProperty({
    description: 'How confident the model is in the answer.',
    enum: ['high', 'low'],
    example: 'high',
  })
  confidence: 'high' | 'low';

  @ApiProperty({
    description:
      'Whether the check_order_status tool was called to produce this answer.',
    example: false,
  })
  tool_used: boolean;

  @ApiProperty({
    description:
      'The FAQ questions retrieved and used as context for this answer.',
    type: [String],
    example: ['What are your business hours?'],
  })
  context_used: string[];

  @ApiProperty({
    description: 'The session ID for the conversation.',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  sessionId: string;
}
