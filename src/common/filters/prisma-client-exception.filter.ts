import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { Prisma } from '#/generated/prisma/client.js';
import { buildErrorBody } from '#/common/filters/error-response.js';

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaClientExceptionFilter implements ExceptionFilter {
  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(
    exception: Prisma.PrismaClientKnownRequestError,
    host: ArgumentsHost,
  ): void {
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

  private toHttp(exception: Prisma.PrismaClientKnownRequestError): {
    status: number;
    message: string;
  } {
    const meta = (exception.meta ?? {}) as Record<string, unknown>;
    const model =
      typeof meta.modelName === 'string' ? meta.modelName : 'Record';

    switch (exception.code) {
      case 'P2002': {
        const target = Array.isArray(meta.target)
          ? meta.target.join(', ')
          : null;
        return {
          status: HttpStatus.CONFLICT,
          message: target
            ? `A record with this ${target} already exists`
            : `A ${model} with these details already exists`,
        };
      }
      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          message:
            typeof meta.cause === 'string' ? meta.cause : `${model} not found`,
        };
      case 'P2003':
        return {
          status: HttpStatus.CONFLICT,
          message: 'Related record constraint failed',
        };
      case 'P2000':
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'Provided value is too long',
        };
      default:
        return {
          status: HttpStatus.BAD_REQUEST,
          message: `Database request error (${exception.code})`,
        };
    }
  }
}
