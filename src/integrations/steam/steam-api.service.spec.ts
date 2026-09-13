import { ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '#/config/env.schema.js';
import { SteamApiService } from '#/integrations/steam/steam-api.service.js';

const steamId = '76561198000000000';

const config = {
  get: (key: keyof Env) => ({ STEAM_API_KEY: 'test-key' })[key as string],
} as unknown as ConfigService<Env, true>;

const summary = {
  personaname: 'nikola',
  avatarmedium: 'https://avatars.steamstatic.com/abc_medium.jpg',
  avatarfull: 'https://avatars.steamstatic.com/abc_full.jpg',
  profileurl: 'https://steamcommunity.com/id/nikola/',
};

function mockSteamReply(
  body: unknown,
  ok = true,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockResolvedValue({ ok, json: async () => body });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('SteamApiService', () => {
  const service = new SteamApiService(config);

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requests the given steamId with the configured key', async () => {
    const fetchMock = mockSteamReply({ response: { players: [summary] } });

    await service.fetchProfile(steamId);

    const url = fetchMock.mock.calls[0][0] as URL;
    expect(url.origin + url.pathname).toBe(
      'https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/',
    );
    expect(url.searchParams.get('key')).toBe('test-key');
    expect(url.searchParams.get('steamids')).toBe(steamId);
  });

  it("maps Steam's field names onto ours", async () => {
    mockSteamReply({ response: { players: [summary] } });

    await expect(service.fetchProfile(steamId)).resolves.toEqual({
      displayName: 'nikola',
      avatarUrl: summary.avatarmedium,
      avatarFullUrl: summary.avatarfull,
      profileUrl: summary.profileurl,
    });
  });

  it('leaves displayName undefined when Steam has no persona name', async () => {
    mockSteamReply({
      response: { players: [{ ...summary, personaname: undefined }] },
    });

    const profile = await service.fetchProfile(steamId);

    expect(profile.displayName).toBeUndefined();
  });

  it('falls back to the canonical profile URL when there is no vanity URL', async () => {
    mockSteamReply({
      response: { players: [{ ...summary, profileurl: undefined }] },
    });

    await expect(service.fetchProfile(steamId)).resolves.toMatchObject({
      profileUrl: `https://steamcommunity.com/profiles/${steamId}`,
    });
  });

  it('throws when Steam responds with an error status', async () => {
    mockSteamReply({}, false);

    await expect(service.fetchProfile(steamId)).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('throws when Steam returns no players', async () => {
    mockSteamReply({ response: { players: [] } });

    await expect(service.fetchProfile(steamId)).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});
