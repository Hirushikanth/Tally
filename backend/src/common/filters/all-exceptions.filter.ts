import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { PostingEngineError } from '../../posting-engine/errors';

const PRISMA_TO_HTTP: Partial<Record<string, HttpStatus>> = {
  P2002: HttpStatus.CONFLICT,
  P2003: HttpStatus.BAD_REQUEST,
  P2014: HttpStatus.BAD_REQUEST,
  P2025: HttpStatus.NOT_FOUND,
};

interface ErrorContext {
  path: string;
  timestamp: string;
  requestId?: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const isProduction = process.env.NODE_ENV === 'production';

    const context: ErrorContext = {
      path: request.url,
      timestamp: new Date().toISOString(),
      requestId:
        (request.id as string | undefined) ??
        (Array.isArray(request.headers['x-request-id'])
          ? request.headers['x-request-id'][0]
          : request.headers['x-request-id']),
    };

    if (exception instanceof PostingEngineError) {
      response.status(HttpStatus.UNPROCESSABLE_ENTITY).json({
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        error: 'Unprocessable Entity',
        message: exception.message,
        name: exception.name,
        ...context,
      });
      return;
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const status =
        PRISMA_TO_HTTP[exception.code] ?? HttpStatus.INTERNAL_SERVER_ERROR;
      if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
        this.logger.error(
          `Unhandled Prisma error ${exception.code}: ${exception.message}`,
          exception.stack,
          context.requestId,
        );
        capture(exception, context);
      }
      response.status(status).json({
        statusCode: status,
        error: HttpStatus[status] ?? 'Internal Server Error',
        message: prismaMessage(exception.code, status),
        name: 'PrismaClientKnownRequestError',
        ...context,
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      if (status >= 500) {
        capture(exception, context);
      }
      const payload = exception.getResponse();
      const body = typeof payload === 'string' ? { message: payload } : payload;
      response.status(status).json({ ...body, ...context });
      return;
    }

    const message =
      exception instanceof Error ? exception.message : String(exception);
    this.logger.error(
      `Unhandled exception: ${message}`,
      exception instanceof Error ? exception.stack : undefined,
      context.requestId,
    );
    capture(exception, context);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'Internal Server Error',
      message: isProduction ? 'Internal server error' : message,
      name: exception instanceof Error ? exception.constructor.name : 'Error',
      ...context,
    });
  }
}

function prismaMessage(code: string, status: HttpStatus): string {
  switch (code) {
    case 'P2002':
      return 'A record with these details already exists';
    case 'P2025':
      return 'Record not found';
    case 'P2003':
      return 'Operation violates a database constraint';
    case 'P2014':
      return 'Operation violates a database relationship';
    default:
      return status === HttpStatus.INTERNAL_SERVER_ERROR
        ? 'Internal server error'
        : 'Database operation failed';
  }
}

// Report 5xx failures to Sentry. No-op when the SDK was never initialized
// (no SENTRY_DSN) — error reporting must never crash the request path.
function capture(exception: unknown, context: ErrorContext): void {
  if (!Sentry.isInitialized()) return;
  Sentry.captureException(
    exception instanceof Error ? exception : new Error(String(exception)),
    {
      tags: { handler: AllExceptionsFilter.name },
      extra: { path: context.path, requestId: context.requestId },
    },
  );
}
