import type { ArgumentsHost } from '@nestjs/common';
import { HttpStatus } from '@nestjs/common';
import type { HttpAdapterHost } from '@nestjs/core';
import { PrismaClientExceptionFilter } from '#/common/filters/prisma-client-exception.filter.js';
import { Prisma } from '#/generated/prisma/client.js';

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

function knownError(
  code: string,
  meta?: Record<string, unknown>,
): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('db error', {
    code,
    clientVersion: 'test',
    meta,
  });
}

describe('PrismaClientExceptionFilter', () => {
  const filter = new PrismaClientExceptionFilter(httpAdapterHost);

  beforeEach(() => reply.mockClear());

  it('maps a unique constraint violation (P2002) to 409, naming the field', () => {
    filter.catch(knownError('P2002', { target: ['steam_id'] }), host);

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

  it('maps P2002 to 409 with the model name when the driver adapter omits target', () => {
    filter.catch(knownError('P2002', { modelName: 'Player' }), host);

    expect(reply).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        statusCode: 409,
        message: 'A Player with these details already exists',
      }),
      HttpStatus.CONFLICT,
    );
  });

  it('maps a missing record (P2025) to 404 using the model name', () => {
    filter.catch(knownError('P2025', { modelName: 'Player' }), host);

    expect(reply).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ statusCode: 404, message: 'Player not found' }),
      HttpStatus.NOT_FOUND,
    );
  });

  it('maps an unknown code to 400 and echoes the code', () => {
    filter.catch(knownError('P2010'), host);

    expect(reply).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        statusCode: 400,
        message: 'Database request error (P2010)',
      }),
      HttpStatus.BAD_REQUEST,
    );
  });
});
