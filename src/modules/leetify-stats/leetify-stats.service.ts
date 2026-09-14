import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, type Repository } from 'typeorm';
import type { LeetifyMatch } from '#/integrations/leetify/leetify-api.service.js';
import { LeetifyApiService } from '#/integrations/leetify/leetify-api.service.js';
import { LeetifyStat } from '#/modules/leetify-stats/leetify-stat.entity.js';
import {
  describeError,
  isRateLimited,
} from '#/modules/leetify-stats/leetify-sync.util.js';
import { PlayerService } from '#/modules/player/player.service.js';

export interface LeetifySyncSummary {
  steamId: string;
  matchesFetched: number;
  matchesSkipped: number;
  matchesRemaining: number;
  rowsUpserted: number;
  failedMatchIds: string[];
  rateLimited: boolean;
}

interface FetchOutcome {
  matches: LeetifyMatch[];
  failedMatchIds: string[];
  rateLimited: boolean;
  processed: number;
}

type LeetifyStatRow = Pick<
  LeetifyStat,
  | 'matchId'
  | 'steamId'
  | 'preAim'
  | 'reactionTime'
  | 'accuracy'
  | 'accuracyEnemySpotted'
  | 'accuracyHead'
  | 'leetifyRating'
  | 'lastUpdated'
>;

const MAX_MATCHES_PER_SYNC = 10;
const UPSERT_CHUNK_SIZE = 500;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toRows(match: LeetifyMatch): LeetifyStatRow[] {
  const lastUpdated = new Date();

  return match.stats.map((stat) => ({
    matchId: match.matchId,
    steamId: stat.steamId,
    preAim: stat.preAim ?? null,
    reactionTime: stat.reactionTime ?? null,
    accuracy: stat.accuracy ?? null,
    accuracyEnemySpotted: stat.accuracyEnemySpotted ?? null,
    accuracyHead: stat.accuracyHead ?? null,
    leetifyRating: stat.leetifyRating ?? null,
    lastUpdated,
  }));
}

@Injectable()
export class LeetifyStatsService {
  private readonly logger = new Logger(LeetifyStatsService.name);

  constructor(
    @InjectRepository(LeetifyStat)
    private readonly stats: Repository<LeetifyStat>,
    private readonly leetifyApi: LeetifyApiService,
    private readonly playerService: PlayerService,
  ) {}

  async syncPlayer(steamId: string): Promise<LeetifySyncSummary> {
    const matchIds = await this.leetifyApi.fetchProfileMatchIds(steamId);
    const pending = await this.excludeStoredMatches(matchIds);
    const batch = pending.slice(0, MAX_MATCHES_PER_SYNC);

    const { matches, failedMatchIds, rateLimited, processed } =
      await this.fetchMatches(batch);

    const rows = matches.flatMap((match) => toRows(match));

    await this.playerService.ensureExist([
      steamId,
      ...rows.map((row) => row.steamId),
    ]);
    await this.upsertRows(rows);

    return {
      steamId,
      matchesFetched: matches.length,
      matchesSkipped: matchIds.length - pending.length,
      matchesRemaining: pending.length - processed,
      rowsUpserted: rows.length,
      failedMatchIds,
      rateLimited,
    };
  }

  findBySteamId(steamId: string): Promise<LeetifyStat[]> {
    return this.stats.find({
      where: { steamId },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(steamId: string, matchId: string): Promise<LeetifyStat> {
    const stat = await this.stats.findOneBy({ steamId, matchId });
    if (!stat) {
      throw new NotFoundException(
        `No Leetify stats for player ${steamId} in match ${matchId}`,
      );
    }
    return stat;
  }

  private async excludeStoredMatches(matchIds: string[]): Promise<string[]> {
    if (!matchIds.length) {
      return [];
    }

    const storable = matchIds.filter((matchId) => UUID_PATTERN.test(matchId));
    if (!storable.length) {
      return matchIds;
    }

    const stored = await this.stats.find({
      where: { matchId: In(storable) },
      select: { matchId: true },
    });

    const seen = new Set(stored.map((row) => row.matchId));
    return matchIds.filter((matchId) => !seen.has(matchId));
  }

  private async fetchMatches(matchIds: string[]): Promise<FetchOutcome> {
    const matches: LeetifyMatch[] = [];
    const failedMatchIds: string[] = [];
    let processed = 0;

    for (const matchId of matchIds) {
      try {
        matches.push(await this.leetifyApi.fetchMatch(matchId));
      } catch (error) {
        if (isRateLimited(error)) {
          this.logger.warn(
            `Leetify rate limit reached after ${processed} match(es); stopping early`,
          );
          return { matches, failedMatchIds, rateLimited: true, processed };
        }

        failedMatchIds.push(matchId);
        this.logger.warn(
          `Skipped Leetify match ${matchId}: ${describeError(error)}`,
        );
      }

      processed += 1;
    }

    return { matches, failedMatchIds, rateLimited: false, processed };
  }

  private async upsertRows(rows: LeetifyStatRow[]): Promise<void> {
    for (let i = 0; i < rows.length; i += UPSERT_CHUNK_SIZE) {
      await this.stats.upsert(rows.slice(i, i + UPSERT_CHUNK_SIZE), {
        conflictPaths: ['matchId', 'steamId'],
      });
    }
  }
}
