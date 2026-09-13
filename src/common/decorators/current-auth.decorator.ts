import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthenticatedRequest } from '#/common/guards/jwt-auth.guard.js';
import type { JwtPayload } from '#/modules/auth/auth.service.js';

export const CurrentAuth = createParamDecorator(
  (_data: unknown, context: ExecutionContext): JwtPayload =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().auth,
);
