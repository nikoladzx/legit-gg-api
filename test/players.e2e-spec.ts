import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';

const steamId = '76561198000000000';
const unknownId = '00000000-0000-0000-0000-000000000000';

describe('Players (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.player.deleteMany();
  });

  afterEach(async () => {
    await prisma.player.deleteMany();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /players creates a player', async () => {
    const res = await request(app.getHttpServer())
      .post('/players')
      .send({ steamId })
      .expect(201);

    expect(res.body).toMatchObject({ steamId });
  });

  it('POST /players with a duplicate steamId returns the 409 envelope', async () => {
    await request(app.getHttpServer())
      .post('/players')
      .send({ steamId })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post('/players')
      .send({ steamId })
      .expect(409);

    expect(res.body).toMatchObject({
      statusCode: 409,
      error: 'Conflict',
      path: '/players',
    });
    expect(res.body.timestamp).toEqual(expect.any(String));
  });

  it('GET /players/:id with an unknown id returns the 404 envelope', async () => {
    const res = await request(app.getHttpServer())
      .get(`/players/${unknownId}`)
      .expect(404);

    expect(res.body).toMatchObject({
      statusCode: 404,
      error: 'Not Found',
      path: `/players/${unknownId}`,
    });
  });

  it('POST /players with an invalid body returns 400 with field errors', async () => {
    const res = await request(app.getHttpServer())
      .post('/players')
      .send({ steamId: 'abc' })
      .expect(400);

    expect(res.body).toMatchObject({
      statusCode: 400,
      message: 'Validation failed',
    });
    expect(res.body.errors[0]).toMatchObject({ path: 'steamId' });
  });

  it('DELETE /players/:id with an unknown id returns 404 (service has no try/catch)', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/players/${unknownId}`)
      .expect(404);

    expect(res.body).toMatchObject({ statusCode: 404, error: 'Not Found' });
  });
});
