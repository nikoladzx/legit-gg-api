import { HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { LeetifyApiService } from '#/integrations/leetify/leetify-api.service.js';
import { LeetifyStat } from '#/modules/leetify-stats/leetify-stat.entity.js';
import { LeetifyStatsService } from '#/modules/leetify-stats/leetify-stats.service.js';
import { PlayerService } from '#/modules/player/player.service.js';

const steamId = '76561198077548350';

const uuid = (n: number): string =>
  `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`;

function matchOf(matchId: string, ...steamIds: string[]) {
  return {
    matchId,
    stats: steamIds.map((id) => ({
      steamId: id,
      preAim: 16.5984,
      reactionTime: 0.6406,
      accuracy: 0.22,
      accuracyEnemySpotted: 0.3056,
      accuracyHead: 0.1212,
      leetifyRating: -0.0399,
    })),
  };
}

describe('LeetifyStatsService', () => {
  let service: LeetifyStatsService;
  let stats: Record<string, ReturnType<typeof vi.fn>>;
  let leetifyApi: Record<string, ReturnType<typeof vi.fn>>;
  let playerService: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    stats = {
      find: vi.fn().mockResolvedValue([]),
      findOneBy: vi.fn(),
      upsert: vi.fn().mockResolvedValue({}),
    };
    leetifyApi = {
      fetchProfileMatchIds: vi.fn().mockResolvedValue([]),
      fetchMatch: vi.fn(),
    };
    playerService = { ensureExist: vi.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeetifyStatsService,
        { provide: getRepositoryToken(LeetifyStat), useValue: stats },
        { provide: LeetifyApiService, useValue: leetifyApi },
        { provide: PlayerService, useValue: playerService },
      ],
    }).compile();

    service = module.get(LeetifyStatsService);
  });

  describe('syncPlayer', () => {
    it('stores a row for every player in the match, not just the one synced', async () => {
      leetifyApi.fetchProfileMatchIds.mockResolvedValue([uuid(1)]);
      leetifyApi.fetchMatch.mockResolvedValue(
        matchOf(uuid(1), steamId, 'other-1', 'other-2'),
      );

      const summary = await service.syncPlayer(steamId);

      expect(summary.rowsUpserted).toBe(3);
      expect(stats.upsert.mock.calls[0][0]).toHaveLength(3);
    });

    it('never re-fetches a match it already stored', async () => {
      leetifyApi.fetchProfileMatchIds.mockResolvedValue([
        uuid(1),
        uuid(2),
        uuid(3),
      ]);
      stats.find.mockResolvedValue([
        { matchId: uuid(1) },
        { matchId: uuid(3) },
      ]);
      leetifyApi.fetchMatch.mockResolvedValue(matchOf(uuid(2), steamId));

      const summary = await service.syncPlayer(steamId);

      expect(leetifyApi.fetchMatch).toHaveBeenCalledTimes(1);
      expect(leetifyApi.fetchMatch).toHaveBeenCalledWith(uuid(2));
      expect(summary).toMatchObject({ matchesFetched: 1, matchesSkipped: 2 });
    });

    it('does nothing at all when every match is already stored', async () => {
      leetifyApi.fetchProfileMatchIds.mockResolvedValue([uuid(1)]);
      stats.find.mockResolvedValue([{ matchId: uuid(1) }]);

      const summary = await service.syncPlayer(steamId);

      expect(leetifyApi.fetchMatch).not.toHaveBeenCalled();
      expect(stats.upsert).not.toHaveBeenCalled();
      expect(summary).toMatchObject({ matchesSkipped: 1, rowsUpserted: 0 });
    });

    it('carries on when one match fails, and reports which', async () => {
      leetifyApi.fetchProfileMatchIds.mockResolvedValue([
        uuid(1),
        'not-a-uuid',
        uuid(2),
      ]);
      leetifyApi.fetchMatch.mockImplementation(async (matchId: string) => {
        if (matchId === 'not-a-uuid') {
          throw new Error('Could not reach the Leetify API');
        }
        return matchOf(matchId, steamId);
      });

      const summary = await service.syncPlayer(steamId);

      expect(summary.matchesFetched).toBe(2);
      expect(summary.failedMatchIds).toEqual(['not-a-uuid']);
      expect(summary.rowsUpserted).toBe(2);
    });

    it('keeps a malformed match id out of the uuid lookup, which would 22P02', async () => {
      leetifyApi.fetchProfileMatchIds.mockResolvedValue([
        uuid(1),
        'not-a-uuid',
      ]);
      leetifyApi.fetchMatch.mockImplementation(async (matchId: string) =>
        matchOf(matchId, steamId),
      );

      await service.syncPlayer(steamId);

      const { where } = stats.find.mock.calls[0][0];
      expect(where.matchId.value).toEqual([uuid(1)]);
    });

    it('takes at most one capped batch per run and reports the remainder', async () => {
      const matchIds = Array.from({ length: 12 }, (_, i) => uuid(i + 1));
      leetifyApi.fetchProfileMatchIds.mockResolvedValue(matchIds);
      leetifyApi.fetchMatch.mockImplementation(async (matchId: string) =>
        matchOf(matchId, steamId),
      );

      const summary = await service.syncPlayer(steamId);

      expect(leetifyApi.fetchMatch).toHaveBeenCalledTimes(10);
      expect(summary).toMatchObject({
        matchesFetched: 10,
        matchesRemaining: 2,
        rateLimited: false,
      });
    });

    it('stops the run the moment Leetify rate limits', async () => {
      const matchIds = Array.from({ length: 5 }, (_, i) => uuid(i + 1));
      leetifyApi.fetchProfileMatchIds.mockResolvedValue(matchIds);
      leetifyApi.fetchMatch.mockImplementation(async (matchId: string) => {
        if (matchId === uuid(3)) {
          throw new HttpException(
            'Leetify rate limit reached',
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
        return matchOf(matchId, steamId);
      });

      const summary = await service.syncPlayer(steamId);

      expect(leetifyApi.fetchMatch).toHaveBeenCalledTimes(3);
      expect(summary).toMatchObject({
        matchesFetched: 2,
        matchesRemaining: 3,
        rateLimited: true,
      });
    });

    it('does not condemn a rate-limited match as broken', async () => {
      leetifyApi.fetchProfileMatchIds.mockResolvedValue([uuid(1)]);
      leetifyApi.fetchMatch.mockRejectedValue(
        new HttpException(
          'Leetify rate limit reached',
          HttpStatus.TOO_MANY_REQUESTS,
        ),
      );

      const summary = await service.syncPlayer(steamId);

      expect(summary.failedMatchIds).toEqual([]);
      expect(summary.matchesRemaining).toBe(1);
    });

    it('still saves what it managed to fetch before being cut off', async () => {
      leetifyApi.fetchProfileMatchIds.mockResolvedValue([uuid(1), uuid(2)]);
      leetifyApi.fetchMatch.mockImplementation(async (matchId: string) => {
        if (matchId === uuid(2)) {
          throw new HttpException(
            'Leetify rate limit reached',
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
        return matchOf(matchId, steamId);
      });

      await service.syncPlayer(steamId);

      expect(stats.upsert.mock.calls[0][0]).toHaveLength(1);
    });

    it('creates the players the foreign key needs before writing stats', async () => {
      leetifyApi.fetchProfileMatchIds.mockResolvedValue([uuid(1)]);
      leetifyApi.fetchMatch.mockResolvedValue(matchOf(uuid(1), 'other-1'));

      await service.syncPlayer(steamId);

      expect(playerService.ensureExist).toHaveBeenCalledWith([
        steamId,
        'other-1',
      ]);
      expect(
        playerService.ensureExist.mock.invocationCallOrder[0],
      ).toBeLessThan(stats.upsert.mock.invocationCallOrder[0]);
    });

    it('registers the synced player even when they have no new matches', async () => {
      leetifyApi.fetchProfileMatchIds.mockResolvedValue([]);

      await service.syncPlayer(steamId);

      expect(playerService.ensureExist).toHaveBeenCalledWith([steamId]);
    });

    it('upserts on (matchId, steamId) so a re-sync never duplicates a row', async () => {
      leetifyApi.fetchProfileMatchIds.mockResolvedValue([uuid(1)]);
      leetifyApi.fetchMatch.mockResolvedValue(matchOf(uuid(1), steamId));

      await service.syncPlayer(steamId);

      expect(stats.upsert).toHaveBeenCalledWith(expect.anything(), {
        conflictPaths: ['matchId', 'steamId'],
      });
    });

    it('stamps lastUpdated and stores missing stats as null', async () => {
      leetifyApi.fetchProfileMatchIds.mockResolvedValue([uuid(1)]);
      leetifyApi.fetchMatch.mockResolvedValue({
        matchId: uuid(1),
        stats: [{ steamId, preAim: 12.5 }],
      });

      await service.syncPlayer(steamId);

      expect(stats.upsert.mock.calls[0][0][0]).toMatchObject({
        matchId: uuid(1),
        steamId,
        preAim: 12.5,
        accuracy: null,
        leetifyRating: null,
        lastUpdated: expect.any(Date),
      });
    });
  });

  describe('findOne', () => {
    it('throws a 404 when the player has no row for that match', async () => {
      stats.findOneBy.mockResolvedValue(null);

      await expect(service.findOne(steamId, uuid(1))).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  it('exposes no way to delete a stats row', () => {
    const methods = Object.getOwnPropertyNames(LeetifyStatsService.prototype);

    expect(
      methods.filter((m) => /delete|remove|clear|truncate/i.test(m)),
    ).toEqual([]);
  });
});
