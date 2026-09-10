import type { ArgumentsHost } from '@nestjs/common';
import {
  BadRequestException,
  HttpStatus,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { HttpAdapterHost } from '@nestjs/core';
import { AllExceptionsFilter } from '#/common/filters/all-exceptions.filter.js';

const reply = vi.fn();

const httpAdapterHost = {
  httpAdapter: {
    getRequestUrl: (req: { url: string }) => req.url,
    reply,
  },
} as unknown as HttpAdapterHost;

const host = {
  switchToHttp: () => ({
    getRequest: () => ({ url: '/players' }),
    getResponse: () => ({}),
  }),
} as unknown as ArgumentsHost;

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter(httpAdapterHost);

  beforeEach(() => {
    reply.mockClear();
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => vi.restoreAllMocks());

  it('wraps an HttpException in the standard envelope', () => {
    filter.catch(new NotFoundException('Player with id x not found'), host);

    expect(reply).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        statusCode: 404,
        error: 'Not Found',
        message: 'Player with id x not found',
        path: '/players',
        timestamp: expect.any(String),
      }),
      HttpStatus.NOT_FOUND,
    );
  });

  it('passes a validation errors array through untouched', () => {
    filter.catch(
      new BadRequestException({
        message: 'Validation failed',
        errors: [{ path: 'steamId', message: 'bad' }],
      }),
      host,
    );

    expect(reply).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        statusCode: 400,
        message: 'Validation failed',
        errors: [{ path: 'steamId', message: 'bad' }],
      }),
      HttpStatus.BAD_REQUEST,
    );
  });

  it('turns an unknown error into a generic 500 that leaks nothing', () => {
    filter.catch(new Error('boom - secret internal detail'), host);

    const body = reply.mock.calls[0][1];
    expect(body).toMatchObject({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Internal server error',
      path: '/players',
    });
    expect(JSON.stringify(body)).not.toContain('boom');
  });
});
