import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { PostingEngineError } from '../../posting-engine/errors';

@Catch(PostingEngineError)
export class DomainErrorFilter implements ExceptionFilter {
  catch(exception: PostingEngineError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    response.status(HttpStatus.UNPROCESSABLE_ENTITY).json({
      statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      error: 'Unprocessable Entity',
      message: exception.message,
      name: exception.name,
      timestamp: new Date().toISOString(),
    });
  }
}
