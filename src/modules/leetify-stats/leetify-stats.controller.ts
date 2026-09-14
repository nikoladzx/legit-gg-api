import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '#/common/guards/jwt-auth.guard.js';
import { ZodValidationPipe } from '#/common/pipes/zod-validation.pipe.js';
import { steamIdSchema } from '#/common/schemas/steam-id.schema.js';
import { matchIdSchema } from '#/modules/leetify-stats/dto/leetify-params.dto.js';
import type { LeetifyRefreshStarted } from '#/modules/leetify-stats/leetify-refresh.service.js';
import { LeetifyRefreshService } from '#/modules/leetify-stats/leetify-refresh.service.js';
import type { LeetifyStat } from '#/modules/leetify-stats/leetify-stat.entity.js';
import type { LeetifySyncSummary } from '#/modules/leetify-stats/leetify-stats.service.js';
import { LeetifyStatsService } from '#/modules/leetify-stats/leetify-stats.service.js';

@Controller('leetify')
export class LeetifyStatsController {
  constructor(
    private readonly leetifyStats: LeetifyStatsService,
    private readonly leetifyRefresh: LeetifyRefreshService,
  ) {}

  @Post('sync/:steamId')
  @UseGuards(JwtAuthGuard)
  sync(
    @Param('steamId', new ZodValidationPipe(steamIdSchema)) steamId: string,
  ): Promise<LeetifySyncSummary> {
    return this.leetifyStats.syncPlayer(steamId);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.ACCEPTED)
  refresh(): Promise<LeetifyRefreshStarted> {
    return this.leetifyRefresh.start();
  }

  @Get('stats/:steamId')
  findBySteamId(
    @Param('steamId', new ZodValidationPipe(steamIdSchema)) steamId: string,
  ): Promise<LeetifyStat[]> {
    return this.leetifyStats.findBySteamId(steamId);
  }

  @Get('stats/:steamId/:matchId')
  findOne(
    @Param('steamId', new ZodValidationPipe(steamIdSchema)) steamId: string,
    @Param('matchId', new ZodValidationPipe(matchIdSchema)) matchId: string,
  ): Promise<LeetifyStat> {
    return this.leetifyStats.findOne(steamId, matchId);
  }
}
