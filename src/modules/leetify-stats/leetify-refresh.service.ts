import {
  ConflictException,
  Injectable,
  Logger,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { delay } from '#/common/delay.util.js';
import type { LeetifySyncSummary } from '#/modules/leetify-stats/leetify-stats.service.js';
import { LeetifyStatsService } from '#/modules/leetify-stats/leetify-stats.service.js';
import {
  describeError,
  isRateLimited,
} from '#/modules/leetify-stats/leetify-sync.util.js';
import { PlayerService } from '#/modules/player/player.service.js';

// A player falls due a month after the last attempt. Hardcoded rather than an env
// var: this is a product decision about how fresh the data should be, not
// something that differs between deployments.
const STALE_AFTER_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1_000;

// One trigger must not queue the whole table into memory and then grind for hours.
// Nothing is lost by capping: a player left unstamped sorts to the front of the
// next run's queue, so passes chain together.
const MAX_PLAYERS_PER_RUN = 250;

// Longer than Leetify's ~30s window, so the budget has certainly refilled before
// the retry goes out. Only reached if the client's own throttle was not enough —
// someone else sharing the IP, or a limit tighter than the one we measured.
const RATE_LIMIT_COOLDOWN_MS = 35_000;

// Three cooldowns in a row means waiting is not working and something has
// changed at Leetify's end. Stop rather than sit in a retry loop for hours.
const MAX_CONSECUTIVE_RATE_LIMITS = 3;

/** The 202 body: the work has been accepted, and this is how much of it there is. */
export interface LeetifyRefreshStarted {
  queued: number;
  /** The cutoff the queue was built from, so an operator can see the scope. */
  staleBefore: Date;
}

export interface LeetifyRefreshSummary {
  playersQueued: number;
  /** Players whose cursor was stamped. A failed player counts — see refreshOne. */
  playersChecked: number;
  playersFailed: number;
  matchesFetched: number;
  rowsUpserted: number;
  /** New matches still unsynced across the run; the next pass takes them. */
  matchesRemaining: number;
  /** True when Leetify's rate limit ended the run early. */
  rateLimited: boolean;
  /** Times the run hit the limit, waited, and carried on. */
  rateLimitPauses: number;
  /** True when the run handed its remaining players back to a shutdown. */
  cancelled: boolean;
}

interface PlayerOutcome {
  sync: LeetifySyncSummary | null;
  rateLimited: boolean;
  failed: boolean;
}

function emptySummary(playersQueued: number): LeetifyRefreshSummary {
  return {
    playersQueued,
    playersChecked: 0,
    playersFailed: 0,
    matchesFetched: 0,
    rowsUpserted: 0,
    matchesRemaining: 0,
    rateLimited: false,
    rateLimitPauses: 0,
    cancelled: false,
  };
}

function accumulate(
  summary: LeetifyRefreshSummary,
  outcome: PlayerOutcome,
): void {
  if (outcome.failed) {
    summary.playersFailed += 1;
  }

  // A rate-limited sync still stored whatever it fetched before being cut off, so
  // its counts belong in the totals even though the player stays unstamped.
  summary.matchesFetched += outcome.sync?.matchesFetched ?? 0;
  summary.rowsUpserted += outcome.sync?.rowsUpserted ?? 0;
  summary.matchesRemaining += outcome.sync?.matchesRemaining ?? 0;
}

@Injectable()
export class LeetifyRefreshService implements OnApplicationShutdown {
  private readonly logger = new Logger(LeetifyRefreshService.name);

  // Instance field rather than a bare const so specs can zero it out; waiting on
  // Leetify's pacing is a live-API concern, not something to assert against.
  private readonly cooldownMs = RATE_LIMIT_COOLDOWN_MS;

  // Set synchronously by start() before it awaits anything: two requests landing
  // in the same tick must not both get past the guard.
  private running = false;

  // The run itself. Never rejects (see start), and kept so the shutdown hook and
  // the specs can wait for something the endpoint deliberately does not.
  private activeRun: Promise<void> | null = null;

  // Flipped by the shutdown hook; the loop reads it between players.
  private stopping = false;

  constructor(
    private readonly leetifyStats: LeetifyStatsService,
    private readonly playerService: PlayerService,
  ) {}

  /**
   * Queues every stale player and walks them in the background, answering as soon
   * as the queue is known. The run itself takes minutes — Leetify's limit forces
   * one request every three seconds — which is longer than any client will hold a
   * connection open, so the work cannot be part of the response.
   */
  async start(): Promise<LeetifyRefreshStarted> {
    if (this.running) {
      throw new ConflictException(
        'A Leetify refresh is already running; wait for it to finish',
      );
    }
    this.running = true;

    const staleBefore = new Date(Date.now() - STALE_AFTER_DAYS * MS_PER_DAY);
    const steamIds = await this.queue(staleBefore);

    this.logger.log(
      `Leetify refresh queued ${steamIds.length} player(s) unchecked since ${staleBefore.toISOString()}`,
    );

    this.activeRun = this.refreshPlayers(steamIds)
      .then((summary) => {
        this.logger.log(`Leetify refresh finished: ${JSON.stringify(summary)}`);
      })
      .catch((error: unknown) => {
        // refreshPlayers isolates each player itself, so anything arriving here is
        // structural — the database went away mid-run. Swallowing it is the whole
        // point: no request is awaiting this promise, and an unhandled rejection
        // would take the process down with it.
        this.logger.error(
          `Leetify refresh run failed: ${describeError(error)}`,
        );
      })
      .finally(() => {
        this.running = false;
        this.activeRun = null;
      });

    return { queued: steamIds.length, staleBefore };
  }

  /**
   * The run itself: one syncPlayer call per player, then the cursor is stamped
   * whether or not that player had anything new. Awaitable and lock-free on
   * purpose — start() owns the "one at a time" rule, this owns the walking, so a
   * spec can drive it directly instead of racing a background promise.
   */
  async refreshPlayers(steamIds: string[]): Promise<LeetifyRefreshSummary> {
    const summary = emptySummary(steamIds.length);
    let consecutiveRateLimits = 0;

    // Index advances only on a player who got through, so a rate-limited player
    // is retried after the cooldown rather than skipped.
    let index = 0;
    while (index < steamIds.length) {
      if (this.stopping) {
        summary.cancelled = true;
        this.logger.warn(
          `Leetify refresh giving up ${steamIds.length - index} player(s) to shutdown`,
        );
        return summary;
      }

      const steamId = steamIds[index];
      const outcome = await this.refreshOne(steamId);
      accumulate(summary, outcome);

      // A 429 is global, not this player's doing, so every other player would hit
      // it too. Waiting out the window beats ending a 178-player run 27 seconds
      // in, which is what stopping here used to do.
      if (outcome.rateLimited) {
        consecutiveRateLimits += 1;

        if (consecutiveRateLimits >= MAX_CONSECUTIVE_RATE_LIMITS) {
          summary.rateLimited = true;
          this.logger.warn(
            `Leetify rate limit persisted across ${consecutiveRateLimits} cooldowns; stopping the refresh`,
          );
          return summary;
        }

        summary.rateLimitPauses += 1;
        this.logger.warn(
          `Leetify rate limit reached on ${steamId}; waiting ${this.cooldownMs}ms before retrying`,
        );
        await delay(this.cooldownMs);
        continue;
      }

      consecutiveRateLimits = 0;
      await this.playerService.markChecked(steamId);
      summary.playersChecked += 1;
      index += 1;
    }

    return summary;
  }

  /** Resolves once no run is in flight — immediately when there is none. */
  async whenIdle(): Promise<void> {
    await this.activeRun;
  }

  /**
   * enableShutdownHooks() is on, so SIGTERM lands here and Nest waits for this to
   * resolve before tearing the TypeORM connection down. The flag lets the loop
   * finish the player it is on and bail, bounding the wait by one sync (~30s worst
   * case) rather than by the whole queue. Being killed harder than that is still
   * safe: a player is stamped only after their own sync returns, and syncPlayer
   * skips matches already stored, so the next run resumes where this one died.
   */
  async onApplicationShutdown(): Promise<void> {
    this.stopping = true;
    await this.whenIdle();
  }

  /**
   * Reads the queue inside start()'s lock. If the query fails the lock has to go
   * back, or one dead connection jams the endpoint on 409 for the life of the
   * process. The error itself still propagates to the global filter.
   */
  private async queue(staleBefore: Date): Promise<string[]> {
    try {
      return await this.playerService.findStaleSteamIds(
        staleBefore,
        MAX_PLAYERS_PER_RUN,
      );
    } catch (error) {
      this.running = false;
      throw error;
    }
  }

  private async refreshOne(steamId: string): Promise<PlayerOutcome> {
    try {
      const sync = await this.leetifyStats.syncPlayer(steamId);
      return { sync, rateLimited: sync.rateLimited, failed: false };
    } catch (error) {
      // fetchProfileMatchIds runs before syncPlayer's own pacing and is not spaced
      // by it, so the rate limit can surface here as a throw rather than as the
      // rateLimited flag on a summary.
      if (isRateLimited(error)) {
        return { sync: null, rateLimited: true, failed: false };
      }

      // Leetify 404s for a teammate who never made a profile, and ensureExist
      // invents plenty of those. Log it, count it, and let the caller stamp it
      // anyway: an unstamped failure parks itself at the head of every future
      // queue and starves the players who can actually be synced.
      this.logger.warn(
        `Leetify refresh skipped ${steamId}: ${describeError(error)}`,
      );
      return { sync: null, rateLimited: false, failed: true };
    }
  }
}
