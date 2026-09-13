import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from '#/common/guards/jwt-auth.guard.js';

const payload = {
  sub: 'auth-uuid',
  playerId: 'player-uuid',
  steamId: '76561198000000000',
};

function contextWith(authorization?: string): {
  context: ExecutionContext;
  request: Record<string, unknown>;
} {
  const request: Record<string, unknown> = { headers: { authorization } };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;

  return { context, request };
}

describe('JwtAuthGuard', () => {
  const verifyAsync = vi.fn();
  const guard = new JwtAuthGuard({ verifyAsync } as unknown as JwtService);

  beforeEach(() => {
    verifyAsync.mockReset();
  });

  it('attaches the verified payload to the request', async () => {
    verifyAsync.mockResolvedValue(payload);
    const { context, request } = contextWith('Bearer good-token');

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.auth).toEqual(payload);
    expect(verifyAsync).toHaveBeenCalledWith('good-token');
  });

  it('accepts the scheme case-insensitively', async () => {
    verifyAsync.mockResolvedValue(payload);
    const { context } = contextWith('bearer good-token');

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('rejects a request with no Authorization header', async () => {
    const { context } = contextWith(undefined);

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(verifyAsync).not.toHaveBeenCalled();
  });

  it('rejects a non-bearer scheme', async () => {
    const { context } = contextWith('Basic dXNlcjpwYXNz');

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(verifyAsync).not.toHaveBeenCalled();
  });

  it('turns a bad or expired token into a 401', async () => {
    verifyAsync.mockRejectedValue(new Error('jwt expired'));
    const { context } = contextWith('Bearer stale-token');

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
