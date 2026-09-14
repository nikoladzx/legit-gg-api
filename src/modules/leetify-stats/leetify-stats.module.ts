import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtAuthGuard } from '#/common/guards/jwt-auth.guard.js';
import { LeetifyModule } from '#/integrations/leetify/leetify.module.js';
import { LeetifyRefreshService } from '#/modules/leetify-stats/leetify-refresh.service.js';
import { LeetifyStat } from '#/modules/leetify-stats/leetify-stat.entity.js';
import { LeetifyStatsController } from '#/modules/leetify-stats/leetify-stats.controller.js';
import { LeetifyStatsService } from '#/modules/leetify-stats/leetify-stats.service.js';
import { PlayerModule } from '#/modules/player/player.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([LeetifyStat]),
    LeetifyModule,
    PlayerModule,
  ],
  controllers: [LeetifyStatsController],
  providers: [LeetifyStatsService, LeetifyRefreshService, JwtAuthGuard],
  exports: [LeetifyStatsService],
})
export class LeetifyStatsModule {}
