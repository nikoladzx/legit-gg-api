import type { ArgumentsHost } from '@nestjs/common';
import { HttpStatus } from '@nestjs/common';
import type { HttpAdapterHost } from '@nestjs/core';
import { QueryFailedError } from 'typeorm';
import { TypeOrmExceptionFilter } from '#/common/filters/typeorm-exception.filter.js';

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

function queryFailedError(
  driverError: Record<string, unknown>,
): QueryFailedError {
  return new QueryFailedError('query', [], {
    name: 'error',
    message: 'db error',
    ...driverError,
  });
}

describe('TypeOrmExceptionFilter', () => {
  const filter = new TypeOrmExceptionFilter(httpAdapterHost);

  beforeEach(() => reply.mockClear());

  it('maps a unique constraint violation (23505) to 409, naming the field', () => {
    filter.catch(
      queryFailedError({
        code: '23505',
        detail: 'Key (steam_id)=(76561198000000000) already exists.',
      }),
      host,
    );

    expect(reply).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        statusCode: 409,
        error: 'Conflict',
        message: 'A record with this steam_id already exists',
        path: '/players',
        timestamp: expect.any(String),
      }),
      HttpStatus.CONFLICT,
    );
  });

  it('maps 23505 to 409 with a generic message when detail is unavailable', () => {
    filter.catch(queryFailedError({ code: '23505' }), host);

    expect(reply).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        statusCode: 409,
        message: 'A record with these details already exists',
      }),
      HttpStatus.CONFLICT,
    );
  });

  it('maps a foreign key violation (23503) to 409', () => {
    filter.catch(queryFailedError({ code: '23503' }), host);

    expect(reply).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        statusCode: 409,
        message: 'Related record constraint failed',
      }),
      HttpStatus.CONFLICT,
    );
  });

  it('maps an unknown code to 400 and echoes the code', () => {
    filter.catch(queryFailedError({ code: '22999' }), host);

    expect(reply).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        statusCode: 400,
        message: 'Database request error (22999)',
      }),
      HttpStatus.BAD_REQUEST,
    );
  });
});
