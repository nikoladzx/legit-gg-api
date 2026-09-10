import { HttpStatus } from '@nestjs/common';

/**
 * The single error envelope shape every failed request returns. `errors` is only
 * populated for validation failures.
 */
export interface ErrorResponseBody {
  statusCode: number;
  error: string;
  message: string | string[];
  path: string;
  timestamp: string;
  errors?: unknown;
}

const REASON_PHRASES: Partial<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: 'Bad Request',
  [HttpStatus.UNAUTHORIZED]: 'Unauthorized',
  [HttpStatus.FORBIDDEN]: 'Forbidden',
  [HttpStatus.NOT_FOUND]: 'Not Found',
  [HttpStatus.METHOD_NOT_ALLOWED]: 'Method Not Allowed',
  [HttpStatus.CONFLICT]: 'Conflict',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'Unprocessable Entity',
  [HttpStatus.TOO_MANY_REQUESTS]: 'Too Many Requests',
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'Internal Server Error',
  [HttpStatus.BAD_GATEWAY]: 'Bad Gateway',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'Service Unavailable',
};

export function reasonPhrase(status: number): string {
  return REASON_PHRASES[status] ?? 'Error';
}

export function buildErrorBody(args: {
  status: number;
  message: string | string[];
  error?: string;
  path: string;
  extra?: Record<string, unknown>;
}): ErrorResponseBody {
  const { status, message, error, path, extra } = args;

  return {
    statusCode: status,
    error: error ?? reasonPhrase(status),
    message,
    path,
    timestamp: new Date().toISOString(),
    ...extra,
  };
}
