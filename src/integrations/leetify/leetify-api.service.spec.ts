import {
  HttpException,
  HttpStatus,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { LeetifyApiService } from '#/integrations/leetify/leetify-api.service.js';

const steamId = '76561198077548350';
const matchId = '8ac8a823-b447-410f-b359-9b43d4d42357';

const rawStat = {
  steam64_id: steamId,
  preaim: 16.5984,
  reaction_time: 0.6406,
  accuracy: 0.22,
  accuracy_enemy_spotted: 0.3056,
  accuracy_head: 0.1212,
  leetify_rating: -0.0399,
};

function mockLeetifyReply(
  body: unknown,
  { ok = true, status = 200 } = {},
): ReturnType<typeof vi.fn> {
  const fetchMock = vi
    .fn()
    .mockResolvedValue({ ok, status, json: async () => body });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('LeetifyApiService', () => {
  const service = new LeetifyApiService();

  Reflect.set(service, 'minIntervalMs', 0);

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('fetchProfileMatchIds', () => {
    it('asks for the given steam64_id', async () => {
      const fetchMock = mockLeetifyReply({ recent_matches: [] });

      await service.fetchProfileMatchIds(steamId);

      const url = fetchMock.mock.calls[0][0] as URL;
      expect(url.origin + url.pathname).toBe(
        'https://api-public.cs-prod.leetify.com/v3/profile',
      );
      expect(url.searchParams.get('steam64_id')).toBe(steamId);
    });

    it('returns the id of every recent match', async () => {
      mockLeetifyReply({
        recent_matches: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      });

      await expect(service.fetchProfileMatchIds(steamId)).resolves.toEqual([
        'a',
        'b',
        'c',
      ]);
    });

    it('drops entries that carry no id', async () => {
      mockLeetifyReply({ recent_matches: [{ id: 'a' }, {}, { id: 'c' }] });

      await expect(service.fetchProfileMatchIds(steamId)).resolves.toEqual([
        'a',
        'c',
      ]);
    });

    it('returns nothing when the profile has no recent_matches', async () => {
      mockLeetifyReply({});

      await expect(service.fetchProfileMatchIds(steamId)).resolves.toEqual([]);
    });

    it('turns an unknown Steam ID (404) into a NotFoundException', async () => {
      mockLeetifyReply('Not Found', { ok: false, status: 404 });

      await expect(service.fetchProfileMatchIds(steamId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('fetchMatch', () => {
    it('requests the match by id', async () => {
      const fetchMock = mockLeetifyReply({ id: matchId, stats: [] });

      await service.fetchMatch(matchId);

      const url = fetchMock.mock.calls[0][0] as URL;
      expect(url.origin + url.pathname).toBe(
        `https://api-public.cs-prod.leetify.com/v2/matches/${matchId}`,
      );
    });

    it("maps Leetify's field names onto ours", async () => {
      mockLeetifyReply({ id: matchId, stats: [rawStat] });

      await expect(service.fetchMatch(matchId)).resolves.toEqual({
        matchId,
        stats: [
          {
            steamId,
            preAim: 16.5984,
            reactionTime: 0.6406,
            accuracy: 0.22,
            accuracyEnemySpotted: 0.3056,
            accuracyHead: 0.1212,
            leetifyRating: -0.0399,
          },
        ],
      });
    });

    it('keeps a negative leetifyRating intact', async () => {
      mockLeetifyReply({ id: matchId, stats: [rawStat] });

      const match = await service.fetchMatch(matchId);

      expect(match.stats[0].leetifyRating).toBe(-0.0399);
    });

    it('returns a row for every player in the match, not just one', async () => {
      const stats = Array.from({ length: 10 }, (_, i) => ({
        ...rawStat,
        steam64_id: `7656119800000000${i}`,
      }));
      mockLeetifyReply({ id: matchId, stats });

      const match = await service.fetchMatch(matchId);

      expect(match.stats).toHaveLength(10);
    });

    it('leaves missing stats undefined rather than inventing zeroes', async () => {
      mockLeetifyReply({
        id: matchId,
        stats: [{ steam64_id: steamId, preaim: 12.5 }],
      });

      const [stat] = (await service.fetchMatch(matchId)).stats;

      expect(stat.preAim).toBe(12.5);
      expect(stat.accuracy).toBeUndefined();
      expect(stat.leetifyRating).toBeUndefined();
    });

    it('skips stat rows with no steam64_id to attribute them to', async () => {
      mockLeetifyReply({ id: matchId, stats: [rawStat, { preaim: 1 }] });

      const match = await service.fetchMatch(matchId);

      expect(match.stats).toHaveLength(1);
    });

    it('turns an unknown match id (Leetify answers 500) into a 503', async () => {
      mockLeetifyReply('Internal Server Error', { ok: false, status: 500 });

      await expect(service.fetchMatch(matchId)).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('reports a 429 as rate limiting, not as an unreachable API', async () => {
      mockLeetifyReply('Too Many Requests', { ok: false, status: 429 });

      const error = await service.fetchMatch(matchId).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(
        HttpStatus.TOO_MANY_REQUESTS,
      );

      expect(error).not.toBeInstanceOf(ServiceUnavailableException);
    });

    it('names the status on an unexpected failure, so it can be diagnosed', async () => {
      mockLeetifyReply('Bad Gateway', { ok: false, status: 502 });

      await expect(service.fetchMatch(matchId)).rejects.toThrow('502');
    });

    it('never parses an error body, which Leetify sends as plain text', async () => {
      const json = vi.fn();
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({ ok: false, status: 500, json }),
      );

      await expect(service.fetchMatch(matchId)).rejects.toThrow(
        ServiceUnavailableException,
      );
      expect(json).not.toHaveBeenCalled();
    });
  });
});
