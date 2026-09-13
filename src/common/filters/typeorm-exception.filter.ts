import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { QueryFailedError } from 'typeorm';
import { buildErrorBody } from '#/common/filters/error-response.js';

const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';
const STRING_DATA_RIGHT_TRUNCATION = '22001';

interface PgDriverError {
  code?: string;
  detail?: string;
  constraint?: string;
}

@Catch(QueryFailedError)
export class TypeOrmExceptionFilter implements ExceptionFilter {
  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: QueryFailedError, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();
    const path = httpAdapter.getRequestUrl(ctx.getRequest()) as string;

    const { status, message } = this.toHttp(exception);

    httpAdapter.reply(
      ctx.getResponse(),
      buildErrorBody({ status, message, path }),
      status,
    );
  }

  private toHttp(exception: QueryFailedError): {
    status: number;
    message: string;
  } {
    const driverError = exception.driverError as PgDriverError;

    switch (driverError.code) {
      case UNIQUE_VIOLATION: {
        const column = driverError.detail?.match(/^Key \(([^)]+)\)=/)?.[1];
        return {
          status: HttpStatus.CONFLICT,
          message: column
            ? `A record with this ${column} already exists`
            : 'A record with these details already exists',
        };
      }
      case FOREIGN_KEY_VIOLATION:
        return {
          status: HttpStatus.CONFLICT,
          message: 'Related record constraint failed',
        };
      case STRING_DATA_RIGHT_TRUNCATION:
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'Provided value is too long',
        };
      default:
        return {
          status: HttpStatus.BAD_REQUEST,
          message: `Database request error (${driverError.code ?? 'unknown'})`,
        };
    }
  }
}
