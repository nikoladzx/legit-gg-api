import { ConflictException, HttpException, HttpStatus } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { LeetifyRefreshService } from '#/modules/leetify-stats/leetify-refresh.service.js';
import type { LeetifySyncSummary } from '#/modules/leetify-stats/leetify-stats.service.js';
import { LeetifyStatsService } from '#/modules/leetify-stats/leetify-stats.service.js';
import { PlayerService } from '#/modules/player/player.service.js';

const steamIds = [
  '76561198000000001',
  '76561198000000002',
  '76561198000000003',
];

function summaryFor(
  steamId: string,
  overrides: Partial<LeetifySyncSummary> = {},
): LeetifySyncSummary {
  return {
    steamId,
    matchesFetched: 1,
    matchesSkipped: 0,
    matchesRemaining: 0,
    rowsUpserted: 10,
    failedMatchIds: [],
    rateLimited: false,
    ...overrides,
  };
}

function rateLimitError(): HttpException {
  return new HttpException(
    'Leetify rate limit reached',
    HttpStatus.TOO_MANY_REQUESTS,
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

describe('LeetifyRefreshService', () => {
  let service: LeetifyRefreshService;
  let leetifyStats: { syncPlayer: ReturnType<typeof vi.fn> };
  let playerService: {
    findStaleSteamIds: ReturnType<typeof vi.fn>;
    markChecked: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    leetifyStats = {
      syncPlayer: vi.fn(async (steamId: string) => summaryFor(steamId)),
    };
    playerService = {
      findStaleSteamIds: vi.fn(async () => [...steamIds]),
      markChecked: vi.fn(async () => undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeetifyRefreshService,
        { provide: LeetifyStatsService, useValue: leetifyStats },
        { provide: PlayerService, useValue: playerService },
      ],
    }).compile();

    service = module.get(LeetifyRefreshService);

    // The cooldown is a live-API concern; the fake client has no window to wait
    // out, so don't make the suite sit through it.
    Reflect.set(service, 'cooldownMs', 0);
  });

  describe('refreshPlayers', () => {
    it('syncs every queued player and stamps each one', async () => {
      const summary = await service.refreshPlayers(steamIds);

      expect(leetifyStats.syncPlayer).toHaveBeenCalledTimes(3);
      expect(playerService.markChecked.mock.calls.map(([id]) => id)).toEqual(
        steamIds,
      );
      expect(summary).toMatchObject({
        playersQueued: 3,
        playersChecked: 3,
        playersFailed: 0,
        rateLimited: false,
        cancelled: false,
      });
    });

    it('totals the per-player counts across the run', async () => {
      leetifyStats.syncPlayer.mockImplementation(async (steamId: string) =>
        summaryFor(steamId, {
          matchesFetched: 2,
          rowsUpserted: 20,
          matchesRemaining: 5,
        }),
      );

      await expect(service.refreshPlayers(steamIds)).resolves.toMatchObject({
        matchesFetched: 6,
        rowsUpserted: 60,
        matchesRemaining: 15,
      });
    });

    it('keeps going when one player blows up', async () => {
      leetifyStats.syncPlayer.mockImplementation(async (steamId: string) => {
        if (steamId === steamIds[1]) {
          throw new Error('Leetify profile not found');
        }
        return summaryFor(steamId);
      });

      const summary = await service.refreshPlayers(steamIds);

      expect(leetifyStats.syncPlayer).toHaveBeenCalledTimes(3);
      expect(summary).toMatchObject({ playersChecked: 3, playersFailed: 1 });
    });

    // The anti-starvation rule: ensureExist invents rows for teammates with no
    // Leetify profile, which 404 forever. Left unstamped they would sit at the
    // head of every future queue and crowd out the players who can be synced.
    it('stamps a failed player anyway, so they cannot jam the queue', async () => {
      leetifyStats.syncPlayer.mockRejectedValue(new Error('404'));

      await service.refreshPlayers([steamIds[0]]);

      expect(playerService.markChecked).toHaveBeenCalledWith(steamIds[0]);
    });

    // The old behaviour ended a 178-player run on the first 429, 27 seconds in.
    it('waits out a rate limit and retries the same player', async () => {
      leetifyStats.syncPlayer
        .mockImplementationOnce(async (steamId: string) =>
          summaryFor(steamId, { rateLimited: true }),
        )
        .mockImplementation(async (steamId: string) => summaryFor(steamId));

      const summary = await service.refreshPlayers(steamIds);

      // Four calls for three players: the first one was attempted twice.
      expect(leetifyStats.syncPlayer).toHaveBeenCalledTimes(4);
      expect(leetifyStats.syncPlayer.mock.calls[1][0]).toBe(steamIds[0]);
      expect(summary).toMatchObject({
        playersChecked: 3,
        rateLimitPauses: 1,
        rateLimited: false,
      });
    });

    it('does not stamp a player until they actually get through', async () => {
      leetifyStats.syncPlayer
        .mockImplementationOnce(async (steamId: string) =>
          summaryFor(steamId, { rateLimited: true }),
        )
        .mockImplementation(async (steamId: string) => summaryFor(steamId));

      await service.refreshPlayers([steamIds[0]]);

      expect(playerService.markChecked).toHaveBeenCalledTimes(1);
    });

    it('gives up when the limit outlasts three cooldowns', async () => {
      leetifyStats.syncPlayer.mockImplementation(async (steamId: string) =>
        summaryFor(steamId, { rateLimited: true }),
      );

      const summary = await service.refreshPlayers(steamIds);

      expect(leetifyStats.syncPlayer).toHaveBeenCalledTimes(3);
      expect(playerService.markChecked).not.toHaveBeenCalled();
      expect(summary).toMatchObject({
        playersChecked: 0,
        rateLimited: true,
        rateLimitPauses: 2,
      });
    });

    // The 429 can surface as a throw from the profile call rather than as the
    // flag on a summary.
    it('treats a thrown 429 the same as the summary flag', async () => {
      leetifyStats.syncPlayer
        .mockRejectedValueOnce(rateLimitError())
        .mockImplementation(async (steamId: string) => summaryFor(steamId));

      const summary = await service.refreshPlayers([steamIds[0]]);

      expect(leetifyStats.syncPlayer).toHaveBeenCalledTimes(2);
      expect(summary).toMatchObject({
        playersChecked: 1,
        playersFailed: 0,
        rateLimitPauses: 1,
      });
    });

    it('keeps the rows a rate-limited sync managed to store', async () => {
      leetifyStats.syncPlayer
        .mockImplementationOnce(async (steamId: string) =>
          summaryFor(steamId, {
            rateLimited: true,
            matchesFetched: 4,
            rowsUpserted: 40,
          }),
        )
        .mockImplementation(async (steamId: string) =>
          summaryFor(steamId, { matchesFetched: 0, rowsUpserted: 0 }),
        );

      await expect(
        service.refreshPlayers([steamIds[0]]),
      ).resolves.toMatchObject({
        matchesFetched: 4,
        rowsUpserted: 40,
      });
    });

    it('gives the remaining players back to a shutdown', async () => {
      leetifyStats.syncPlayer.mockImplementation(async (steamId: string) => {
        Reflect.set(service, 'stopping', true);
        return summaryFor(steamId);
      });

      const summary = await service.refreshPlayers(steamIds);

      expect(leetifyStats.syncPlayer).toHaveBeenCalledTimes(1);
      expect(summary).toMatchObject({ playersChecked: 1, cancelled: true });
    });
  });

  describe('start', () => {
    it('answers with the queue size without waiting for the run', async () => {
      await expect(service.start()).resolves.toMatchObject({ queued: 3 });

      await service.whenIdle();
      expect(leetifyStats.syncPlayer).toHaveBeenCalledTimes(3);
    });

    // Bounded against real clock readings rather than vi.setSystemTime: the run
    // itself waits on setTimeout, so installing fake timers here would hang it.
    it('queues players unchecked for a month, capped at 250', async () => {
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1_000;

      const before = Date.now();
      const started = await service.start();
      const after = Date.now();
      await service.whenIdle();

      const [staleBefore, limit] =
        playerService.findStaleSteamIds.mock.calls[0];
      expect(limit).toBe(250);
      expect(staleBefore.getTime()).toBeGreaterThanOrEqual(
        before - thirtyDaysMs,
      );
      expect(staleBefore.getTime()).toBeLessThanOrEqual(after - thirtyDaysMs);
      expect(started.staleBefore).toEqual(staleBefore);
    });

    it('does nothing when no player is stale', async () => {
      playerService.findStaleSteamIds.mockResolvedValue([]);

      await expect(service.start()).resolves.toMatchObject({ queued: 0 });

      await service.whenIdle();
      expect(leetifyStats.syncPlayer).not.toHaveBeenCalled();
    });

    it('refuses a second run while one is in flight', async () => {
      const gate = deferred<LeetifySyncSummary>();
      leetifyStats.syncPlayer.mockReturnValueOnce(gate.promise);

      await service.start();
      await expect(service.start()).rejects.toThrow(ConflictException);

      gate.resolve(summaryFor(steamIds[0]));
      await service.whenIdle();
    });

    it('frees the lock once the run finishes', async () => {
      await service.start();
      await service.whenIdle();

      await expect(service.start()).resolves.toMatchObject({ queued: 3 });
      await service.whenIdle();
    });

    // One dead connection must not jam the endpoint on 409 for the life of the
    // process.
    it('frees the lock when the queue query itself fails', async () => {
      playerService.findStaleSteamIds.mockRejectedValueOnce(
        new Error('connection terminated'),
      );

      await expect(service.start()).rejects.toThrow('connection terminated');
      await expect(service.start()).resolves.toMatchObject({ queued: 3 });
      await service.whenIdle();
    });

    // Nothing awaits the background promise, so a rejection would reach Node's
    // unhandledRejection and take the process down.
    it('never lets a blown-up run reject', async () => {
      vi.spyOn(service, 'refreshPlayers').mockRejectedValue(
        new Error('database went away'),
      );

      await expect(service.start()).resolves.toMatchObject({ queued: 3 });
      await expect(service.whenIdle()).resolves.toBeUndefined();

      // And the lock still came back.
      vi.mocked(service.refreshPlayers).mockRestore();
      await expect(service.start()).resolves.toMatchObject({ queued: 3 });
      await service.whenIdle();
    });
  });

  describe('whenIdle', () => {
    it('resolves immediately when no run is in flight', async () => {
      await expect(service.whenIdle()).resolves.toBeUndefined();
    });
  });

  describe('onApplicationShutdown', () => {
    it('stops the loop and waits for the player in flight', async () => {
      await service.start();
      await service.onApplicationShutdown();

      // The first player was already under way when the flag flipped, so it
      // finishes; the rest are handed back rather than started.
      expect(leetifyStats.syncPlayer.mock.calls.length).toBeLessThan(3);
    });
  });
});
