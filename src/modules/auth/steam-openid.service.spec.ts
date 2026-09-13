import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '#/config/env.schema.js';
import { SteamOpenIdService } from '#/modules/auth/steam-openid.service.js';

const steamId = '76561198000000000';

const config = {
  get: (key: keyof Env) =>
    ({
      APP_BASE_URL: 'https://api.legit.gg',
      STEAM_API_KEY: 'test-key',
    })[key as string],
} as unknown as ConfigService<Env, true>;

function validCallback(): Record<string, string> {
  return {
    'openid.mode': 'id_res',
    'openid.claimed_id': `https://steamcommunity.com/openid/id/${steamId}`,
    'openid.sig': 'abc',
    unrelated: 'should-not-be-forwarded',
  };
}

function mockSteamReply(body: string, ok = true): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockResolvedValue({ ok, text: async () => body });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('SteamOpenIdService', () => {
  const service = new SteamOpenIdService(config);

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('buildRedirectUrl', () => {
    it('points at Steam with a return_to under APP_BASE_URL', () => {
      const url = new URL(service.buildRedirectUrl());

      expect(url.origin + url.pathname).toBe(
        'https://steamcommunity.com/openid/login',
      );
      expect(url.searchParams.get('openid.mode')).toBe('checkid_setup');
      expect(url.searchParams.get('openid.return_to')).toBe(
        'https://api.legit.gg/auth/steam/return',
      );
      expect(url.searchParams.get('openid.realm')).toBe('https://api.legit.gg');
      expect(url.searchParams.get('openid.identity')).toBe(
        'http://specs.openid.net/auth/2.0/identifier_select',
      );
    });
  });

  describe('verifyCallback', () => {
    it('returns the steamId when Steam vouches for the response', async () => {
      mockSteamReply('ns:http://specs.openid.net/auth/2.0\nis_valid:true\n');

      await expect(service.verifyCallback(validCallback())).resolves.toBe(
        steamId,
      );
    });

    it('echoes only openid.* params back, with mode swapped', async () => {
      const fetchMock = mockSteamReply('is_valid:true');

      await service.verifyCallback(validCallback());

      const body = fetchMock.mock.calls[0][1].body as string;
      const sent = new URLSearchParams(body);
      expect(sent.get('openid.mode')).toBe('check_authentication');
      expect(sent.get('openid.sig')).toBe('abc');
      expect(sent.has('unrelated')).toBe(false);
    });

    it('rejects a response Steam does not vouch for', async () => {
      mockSteamReply('is_valid:false');

      await expect(service.verifyCallback(validCallback())).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects a cancelled sign-in without calling Steam', async () => {
      const fetchMock = mockSteamReply('is_valid:true');

      await expect(
        service.verifyCallback({ 'openid.mode': 'cancel' }),
      ).rejects.toThrow(UnauthorizedException);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects a claimed_id that is not a Steam identity URL', async () => {
      mockSteamReply('is_valid:true');

      await expect(
        service.verifyCallback({
          'openid.mode': 'id_res',
          'openid.claimed_id': 'https://evil.example/openid/id/123',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
