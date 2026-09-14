import 'reflect-metadata';
import 'dotenv/config';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { Auth } from '../modules/auth/auth.entity.js';
import { LeetifyStat } from '../modules/leetify-stats/leetify-stat.entity.js';
import { Player } from '../modules/player/player.entity.js';

export default new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [Player, Auth, LeetifyStat],
  migrations: [join(import.meta.dirname, 'migrations', '*.{js,ts}')],
  synchronize: false,
});
