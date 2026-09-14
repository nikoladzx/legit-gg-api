import { HttpException, HttpStatus } from '@nestjs/common';

export function isRateLimited(error: unknown): boolean {
  return (
    error instanceof HttpException &&
    error.getStatus() === HttpStatus.TOO_MANY_REQUESTS
  );
}

export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
