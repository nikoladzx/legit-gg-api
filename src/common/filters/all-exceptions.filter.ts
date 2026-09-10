import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { buildErrorBody } from '#/common/filters/error-response.js';

interface NormalizedError {
  status: number;
  message: string | string[];
  error?: string;
  extra?: Record<string, unknown>;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionsFilter');

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();
    const path = httpAdapter.getRequestUrl(ctx.getRequest()) as string;

    const normalized = this.normalize(exception);
    this.logServerErrors(exception, normalized.status, path);

    httpAdapter.reply(
      ctx.getResponse(),
      buildErrorBody({ ...normalized, path }),
      normalized.status,
    );
  }

  private normalize(exception: unknown): NormalizedError {
    if (exception instanceof HttpException) {
      return this.fromHttpException(exception);
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
    };
  }

  private fromHttpException(exception: HttpException): NormalizedError {
    const status = exception.getStatus();
    const response = exception.getResponse();

    if (typeof response === 'string') {
      return { status, message: response };
    }

    const body = (response ?? {}) as Record<string, unknown>;
    return {
      status,
      message:
        (body.message as string | string[] | undefined) ?? exception.message,
      error: body.error as string | undefined,
      extra: body.errors === undefined ? undefined : { errors: body.errors },
    };
  }

  private logServerErrors(
    exception: unknown,
    status: number,
    path: string,
  ): void {
    if (status < HttpStatus.INTERNAL_SERVER_ERROR) {
      return;
    }

    const stack =
      exception instanceof Error ? exception.stack : String(exception);
    this.logger.error(`${status} ${path}`, stack);
  }
}
