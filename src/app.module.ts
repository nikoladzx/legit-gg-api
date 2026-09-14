import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CommonModule } from '#/common/common.module.js';
import { validateEnv } from '#/config/env.schema.js';
import { DatabaseModule } from '#/database/database.module.js';
import { HealthModule } from '#/health/health.module.js';
import { AuthModule } from '#/modules/auth/auth.module.js';
import { LeetifyStatsModule } from '#/modules/leetify-stats/leetify-stats.module.js';
import { PlayerModule } from '#/modules/player/player.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
    }),
    CommonModule,
    DatabaseModule,
    HealthModule,
    PlayerModule,
    AuthModule,
    LeetifyStatsModule,
  ],
})
export class AppModule {}
