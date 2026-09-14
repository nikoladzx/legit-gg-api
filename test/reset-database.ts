import type { INestApplication } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import { assertTestDatabase } from './test-database-guard.js';

export async function resetDatabase(app: INestApplication): Promise<void> {
  const dataSource = app.get<DataSource>(getDataSourceToken());

  const { url } = dataSource.options as { url?: string };
  assertTestDatabase(url);

  await dataSource.query(
    'TRUNCATE TABLE "leetify_stats", "auth", "players" CASCADE',
  );
}
