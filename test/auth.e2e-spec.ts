import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import type { Repository } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { Auth } from '../src/modules/auth/auth.entity.js';
import { SteamApiService } from '../src/integrations/steam/steam-api.service.js';
import { SteamOpenIdService } from '../src/modules/auth/steam-openid.service.js';
import { Player } from '../src/modules/player/player.entity.js';
import { resetDatabase } from './reset-database.js';

const steamId = '76561198000000000';
const profile = {
  displayName: 'nikola',
  avatarUrl: 'https://avatars.steamstatic.com/abc_medium.jpg',
  avatarFullUrl: 'https://avatars.steamstatic.com/abc_full.jpg',
  profileUrl: 'https://steamcommunity.com/id/nikola/',
};

const steamOpenId = {
  buildRedirectUrl: () =>
    'https://steamcommunity.com/openid/login?openid.mode=checkid_setup',
  verifyCallback: async () => steamId,
};
const steamApi = { fetchProfile: async () => profile };

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let auths: Repository<Auth>;
  let players: Repository<Player>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(SteamOpenIdService)
      .useValue(steamOpenId)
      .overrideProvider(SteamApiService)
      .useValue(steamApi)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    auths = app.get(getRepositoryToken(Auth));
    players = app.get(getRepositoryToken(Player));
  });

  beforeEach(async () => {
    await resetDatabase(app);
  });

  afterAll(async () => {
    await resetDatabase(app);
    await app.close();
  });

  async function signIn(): Promise<string> {
    const res = await request(app.getHttpServer())
      .get('/auth/steam/return')
      .query({ 'openid.mode': 'id_res' })
      .expect(200);

    return res.body.accessToken;
  }

  it('GET /auth/steam redirects to Steam', async () => {
    const res = await request(app.getHttpServer())
      .get('/auth/steam')
      .expect(302);

    expect(res.headers.location).toContain('steamcommunity.com/openid/login');
  });

  it('GET /auth/steam/return issues a token and the display info', async () => {
    const res = await request(app.getHttpServer())
      .get('/auth/steam/return')
      .query({ 'openid.mode': 'id_res' })
      .expect(200);

    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.auth).toMatchObject({
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      profileUrl: profile.profileUrl,
    });
  });

  it('creates exactly one player and auth record across repeat sign-ins', async () => {
    await signIn();
    await signIn();

    expect(await players.count()).toBe(1);
    expect(await auths.count()).toBe(1);
  });

  it('links the auth record to a player carrying the verified steamId', async () => {
    await signIn();

    const auth = await auths.findOne({
      where: {},
      relations: { player: true },
    });
    expect(auth?.player.steamId).toBe(steamId);
  });

  it('GET /auth/me returns the signed-in auth', async () => {
    const token = await signIn();

    const res = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body).toMatchObject({ displayName: profile.displayName });
    expect(res.body.player).toMatchObject({ steamId });
  });

  it('GET /auth/me without a token returns the 401 envelope', async () => {
    const res = await request(app.getHttpServer()).get('/auth/me').expect(401);

    expect(res.body).toMatchObject({
      statusCode: 401,
      error: 'Unauthorized',
      path: '/auth/me',
    });
  });

  it('GET /auth/me with a bad token returns 401', async () => {
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', 'Bearer not-a-real-token')
      .expect(401);
  });
});
