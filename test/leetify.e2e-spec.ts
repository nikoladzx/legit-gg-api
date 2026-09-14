import {
  HttpException,
  HttpStatus,
  type INestApplication,
} from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { IsNull, Not, type Repository } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { LeetifyApiService } from '../src/integrations/leetify/leetify-api.service.js';
import { SteamApiService } from '../src/integrations/steam/steam-api.service.js';
import { LeetifyRefreshService } from '../src/modules/leetify-stats/leetify-refresh.service.js';
import { LeetifyStat } from '../src/modules/leetify-stats/leetify-stat.entity.js';
import { SteamOpenIdService } from '../src/modules/auth/steam-openid.service.js';
import { Player } from '../src/modules/player/player.entity.js';
import { resetDatabase } from './reset-database.js';

const steamId = '76561198077548350';
const teammates = Array.from({ length: 9 }, (_, i) => `7656119900000000${i}`);
const everyone = [steamId, ...teammates];
const matchId = '8ac8a823-b447-410f-b359-9b43d4d42357';
const secondMatchId = '1f1e6b1a-0000-4000-8000-0000000000aa';

function matchWith(id: string) {
  return {
    matchId: id,
    stats: everyone.map((player, index) => ({
      steamId: player,
      preAim: 13.6872,
      reactionTime: 0.5313,
      accuracy: 0.4154,
      accuracyEnemySpotted: 0.6429,
      accuracyHead: 0.5652,
      leetifyRating: index === 0 ? -0.0768 : 0.22,
    })),
  };
}

const leetifyApi = {
  fetchProfileMatchIds: vi.fn(async () => [matchId]),
  fetchMatch: vi.fn(async (id: string) => matchWith(id)),
};

const steamOpenId = {
  buildRedirectUrl: () => 'https://steamcommunity.com/openid/login',
  verifyCallback: async () => steamId,
};
const steamApi = {
  fetchProfile: async () => ({
    displayName: 'nikola',
    avatarUrl: 'https://avatars.steamstatic.com/abc_medium.jpg',
    avatarFullUrl: 'https://avatars.steamstatic.com/abc_full.jpg',
    profileUrl: 'https://steamcommunity.com/id/nikola/',
  }),
};

describe('Leetify (e2e)', () => {
  let app: INestApplication;
  let stats: Repository<LeetifyStat>;
  let players: Repository<Player>;
  let refreshService: LeetifyRefreshService;
  let token: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(LeetifyApiService)
      .useValue(leetifyApi)
      .overrideProvider(SteamOpenIdService)
      .useValue(steamOpenId)
      .overrideProvider(SteamApiService)
      .useValue(steamApi)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    stats = app.get(getRepositoryToken(LeetifyStat));
    players = app.get(getRepositoryToken(Player));

    refreshService = app.get(LeetifyRefreshService);
    Reflect.set(refreshService, 'cooldownMs', 0);
  });

  beforeEach(async () => {
    await refreshService.whenIdle();
    await resetDatabase(app);
    leetifyApi.fetchProfileMatchIds.mockClear();
    leetifyApi.fetchMatch.mockClear();
    leetifyApi.fetchProfileMatchIds.mockResolvedValue([matchId]);
    token = await signIn();
  });

  afterAll(async () => {
    await refreshService.whenIdle();
    await resetDatabase(app);
    await app.close();
  });

  async function signIn(): Promise<string> {
    const res = await request(app.getHttpServer())
      .get('/auth/steam/return')
      .query({ 'openid.mode': 'id_res' })
      .expect(302);

    return new URL(res.headers.location).searchParams.get('token') as string;
  }

  function sync(id = steamId) {
    return request(app.getHttpServer())
      .post(`/leetify/sync/${id}`)
      .set('Authorization', `Bearer ${token}`);
  }

  it('requires a token, since one call fans out to many Leetify requests', async () => {
    await request(app.getHttpServer())
      .post(`/leetify/sync/${steamId}`)
      .expect(401);

    expect(leetifyApi.fetchProfileMatchIds).not.toHaveBeenCalled();
  });

  it('rejects a malformed steamId before calling Leetify', async () => {
    await request(app.getHttpServer())
      .post('/leetify/sync/abc')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);

    expect(leetifyApi.fetchProfileMatchIds).not.toHaveBeenCalled();
  });

  it('stores a row for all ten players and creates the ones it has not seen', async () => {
    const res = await sync().expect(201);

    expect(res.body).toMatchObject({
      steamId,
      matchesFetched: 1,
      matchesSkipped: 0,
      matchesRemaining: 0,
      rowsUpserted: 10,
      failedMatchIds: [],
      rateLimited: false,
    });
    expect(await stats.count()).toBe(10);
    expect(await players.count()).toBe(10);
  });

  it('is idempotent: a repeat sync adds nothing and re-fetches nothing', async () => {
    await sync().expect(201);
    leetifyApi.fetchMatch.mockClear();

    const res = await sync().expect(201);

    expect(res.body).toMatchObject({
      matchesFetched: 0,
      matchesSkipped: 1,
      rowsUpserted: 0,
    });
    expect(leetifyApi.fetchMatch).not.toHaveBeenCalled();
    expect(await stats.count()).toBe(10);
  });

  it('adds only the new match when one arrives later', async () => {
    await sync().expect(201);
    leetifyApi.fetchProfileMatchIds.mockResolvedValue([matchId, secondMatchId]);

    const res = await sync().expect(201);

    expect(res.body).toMatchObject({ matchesFetched: 1, matchesSkipped: 1 });
    expect(leetifyApi.fetchMatch).toHaveBeenLastCalledWith(secondMatchId);
    expect(await stats.count()).toBe(20);
  });

  it('keeps a match that Leetify fails on out of the way of the rest', async () => {
    leetifyApi.fetchProfileMatchIds.mockResolvedValue([matchId, 'broken']);
    leetifyApi.fetchMatch.mockImplementation(async (id: string) => {
      if (id === 'broken') {
        throw new Error('Could not reach the Leetify API');
      }
      return matchWith(id);
    });

    const res = await sync().expect(201);

    expect(res.body).toMatchObject({
      matchesFetched: 1,
      failedMatchIds: ['broken'],
    });
    expect(await stats.count()).toBe(10);

    leetifyApi.fetchMatch.mockImplementation(async (id: string) =>
      matchWith(id),
    );
  });

  it('stops on a rate limit, keeps what it got, and says how much is left', async () => {
    const ids = Array.from(
      { length: 4 },
      (_, i) => `0000000${i}-0000-4000-8000-000000000000`,
    );
    leetifyApi.fetchProfileMatchIds.mockResolvedValue(ids);
    leetifyApi.fetchMatch.mockImplementation(async (id: string) => {
      if (id === ids[2]) {
        throw new HttpException('rate limited', HttpStatus.TOO_MANY_REQUESTS);
      }
      return matchWith(id);
    });

    const res = await sync().expect(201);

    expect(res.body).toMatchObject({
      matchesFetched: 2,
      matchesRemaining: 2,
      rateLimited: true,
      failedMatchIds: [],
    });

    expect(await stats.count()).toBe(20);

    leetifyApi.fetchMatch.mockImplementation(async (id: string) =>
      matchWith(id),
    );
  });

  it('resumes where it left off on the next call', async () => {
    const ids = Array.from(
      { length: 12 },
      (_, i) => `0000${String(i).padStart(4, '0')}-0000-4000-8000-000000000000`,
    );
    leetifyApi.fetchProfileMatchIds.mockResolvedValue(ids);

    const first = await sync().expect(201);
    expect(first.body).toMatchObject({
      matchesFetched: 10,
      matchesRemaining: 2,
    });

    const second = await sync().expect(201);
    expect(second.body).toMatchObject({
      matchesFetched: 2,
      matchesSkipped: 10,
      matchesRemaining: 0,
    });

    expect(await stats.count()).toBe(120);
  });

  describe('refreshing the whole player base', () => {
    function refresh() {
      return request(app.getHttpServer())
        .post('/leetify/refresh')
        .set('Authorization', `Bearer ${token}`);
    }

    it('requires a token, since one call fans out across every player', async () => {
      await request(app.getHttpServer()).post('/leetify/refresh').expect(401);

      expect(leetifyApi.fetchProfileMatchIds).not.toHaveBeenCalled();
    });

    it('walks every never-checked player, teammates included', async () => {
      await sync().expect(201);
      leetifyApi.fetchProfileMatchIds.mockClear();

      const res = await refresh().expect(202);
      expect(res.body).toMatchObject({ queued: 10 });

      await refreshService.whenIdle();

      expect(leetifyApi.fetchProfileMatchIds).toHaveBeenCalledTimes(10);
      expect(await players.countBy({ lastCheckedAt: IsNull() })).toBe(0);
    });

    it('leaves a freshly checked player out of the queue', async () => {
      await sync().expect(201);
      await players.update({ steamId }, { lastCheckedAt: new Date() });

      const res = await refresh().expect(202);

      expect(res.body).toMatchObject({ queued: 9 });
      await refreshService.whenIdle();
    });

    it('takes matches already in the database no further', async () => {
      await sync().expect(201);
      leetifyApi.fetchMatch.mockClear();

      await refresh().expect(202);
      await refreshService.whenIdle();

      expect(leetifyApi.fetchMatch).not.toHaveBeenCalled();
      expect(await stats.count()).toBe(10);
    });

    it('refuses a second refresh while one is still running', async () => {
      await sync().expect(201);

      const gate = { release: () => {} };
      leetifyApi.fetchProfileMatchIds.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            gate.release = () => resolve([matchId]);
          }),
      );

      await refresh().expect(202);
      const res = await refresh().expect(409);
      expect(res.body).toMatchObject({ statusCode: 409, error: 'Conflict' });

      gate.release();
      await refreshService.whenIdle();
    });

    it('stops on a rate limit and leaves the rest for the next run', async () => {
      await sync().expect(201);

      let calls = 0;
      leetifyApi.fetchProfileMatchIds.mockImplementation(async () => {
        calls += 1;
        if (calls > 1) {
          throw new HttpException('rate limited', HttpStatus.TOO_MANY_REQUESTS);
        }
        return [matchId];
      });

      await refresh().expect(202);
      await refreshService.whenIdle();

      expect(await players.countBy({ lastCheckedAt: Not(IsNull()) })).toBe(1);

      leetifyApi.fetchProfileMatchIds.mockResolvedValue([matchId]);
    });

    it('frees the lock once the run is done', async () => {
      await refresh().expect(202);
      await refreshService.whenIdle();

      await refresh().expect(202);
      await refreshService.whenIdle();
    });
  });

  describe('reading stats back', () => {
    beforeEach(async () => {
      await sync().expect(201);
    });

    it('returns the stats as numbers, not strings', async () => {
      const res = await request(app.getHttpServer())
        .get(`/leetify/stats/${steamId}`)
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({
        matchId,
        steamId,
        preAim: 13.6872,
        reactionTime: 0.5313,
        accuracy: 0.4154,
        accuracyEnemySpotted: 0.6429,
        accuracyHead: 0.5652,
        leetifyRating: -0.0768,
      });
      expect(typeof res.body[0].accuracy).toBe('number');
      expect(res.body[0].lastUpdated).toEqual(expect.any(String));
    });

    it('returns one match for one player', async () => {
      const res = await request(app.getHttpServer())
        .get(`/leetify/stats/${steamId}/${matchId}`)
        .expect(200);

      expect(res.body).toMatchObject({ matchId, steamId });
    });

    it('404s for a match the player has no row for', async () => {
      const res = await request(app.getHttpServer())
        .get(`/leetify/stats/${steamId}/${secondMatchId}`)
        .expect(404);

      expect(res.body).toMatchObject({ statusCode: 404, error: 'Not Found' });
    });

    it('refuses to delete a player who has stats, and keeps the rows', async () => {
      const { body: player } = await request(app.getHttpServer())
        .get(`/players/steam/${steamId}`)
        .expect(200);

      const res = await request(app.getHttpServer())
        .delete(`/players/${player.id}`)
        .expect(409);

      expect(res.body).toMatchObject({ statusCode: 409, error: 'Conflict' });
      expect(await stats.count()).toBe(10);
      expect(await players.count()).toBe(10);
    });
  });
});
