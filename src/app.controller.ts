import { Controller, Get } from '@nestjs/common';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';

@Controller()
export class AppController {
  @Get()
  @ApiExcludeEndpoint()
  @SkipThrottle()
  getHome(): string {
    return 'App ready to process request';
  }
}
