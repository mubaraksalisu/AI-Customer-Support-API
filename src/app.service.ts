import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello World!';
  }

  chat() {
    return {
      message: 'This is a chat response from the server.',
    };
  }
}
