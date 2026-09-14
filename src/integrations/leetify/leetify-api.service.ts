import {
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { delay } from '#/common/delay.util.js';

const LEETIFY_BASE_URL = 'https://api-public.cs-prod.leetify.com';
const PROFILE_ENDPOINT = `${LEETIFY_BASE_URL}/v3/profile`;
const MATCHES_ENDPOINT = `${LEETIFY_BASE_URL}/v2/matches`;

// Measured against the live API: roughly 10 requests per ~30s window, per IP and
// shared across every endpoint — a profile call and a match call draw from the
// same budget. Spacing every request 4s apart leaves ~7 per window, enough head
// room that an unlucky burst does not sit exactly on the line.
//
// This gate is the only pacing in the app on purpose. Callers used to space
// themselves, which meant each new call site had to remember to, and two of them
// did not: the profile request that opens a sync and the first match after it
// both went out unthrottled, putting 11 requests into 27s and earning a 429 on
// the very first player of a batch run.
const MIN_REQUEST_INTERVAL_MS = 4_000;

/**
 * One player's line in a match. Every stat is optional: Leetify omits fields for
 * matches it has not finished processing, and the caller decides what a missing
 * value means — a 0.0 accuracy is not the same answer as "unknown".
 */
export interface LeetifyMatchStat {
  steamId: string;
  preAim?: number;
  reactionTime?: number;
  accuracy?: number;
  accuracyEnemySpotted?: number;
  accuracyHead?: number;
  leetifyRating?: number;
}

export interface LeetifyMatch {
  matchId: string;
  stats: LeetifyMatchStat[];
}

interface RawProfileResponse {
  recent_matches?: { id?: string }[];
}

interface RawMatchStat {
  steam64_id?: string;
  preaim?: number;
  reaction_time?: number;
  accuracy?: number;
  accuracy_enemy_spotted?: number;
  accuracy_head?: number;
  leetify_rating?: number;
}

interface RawMatchResponse {
  id?: string;
  stats?: RawMatchStat[];
}

function toMatchStat(raw: RawMatchStat, steamId: string): LeetifyMatchStat {
  return {
    steamId,
    preAim: raw.preaim,
    reactionTime: raw.reaction_time,
    accuracy: raw.accuracy,
    accuracyEnemySpotted: raw.accuracy_enemy_spotted,
    accuracyHead: raw.accuracy_head,
    leetifyRating: raw.leetify_rating,
  };
}

@Injectable()
export class LeetifyApiService {
  // Instance field rather than a bare const so specs can zero it out; waiting on
  // Leetify's pacing is a live-API concern, not something to assert against.
  private readonly minIntervalMs = MIN_REQUEST_INTERVAL_MS;

  private lastRequestAt = 0;

  // Requests queue behind one another here. A bare "has enough time passed?"
  // check would let two concurrent callers read the same lastRequestAt and fire
  // together, which is exactly the burst the limit punishes.
  private gate: Promise<void> = Promise.resolve();

  async fetchProfileMatchIds(steamId: string): Promise<string[]> {
    const url = new URL(PROFILE_ENDPOINT);
    url.searchParams.set('steam64_id', steamId);

    const body = await this.getJson<RawProfileResponse>(
      url,
      `Leetify has no profile for Steam ID ${steamId}`,
    );

    return (body.recent_matches ?? [])
      .map((match) => match.id)
      .filter((id): id is string => Boolean(id));
  }

  /** Returns every player's stats for the match, not just one. */
  async fetchMatch(matchId: string): Promise<LeetifyMatch> {
    const body = await this.getJson<RawMatchResponse>(
      new URL(`${MATCHES_ENDPOINT}/${matchId}`),
      `Leetify has no match ${matchId}`,
    );

    return {
      matchId: body.id ?? matchId,
      stats: (body.stats ?? []).flatMap((raw) =>
        raw.steam64_id ? [toMatchStat(raw, raw.steam64_id)] : [],
      ),
    };
  }

  /**
   * Holds the caller until the shared interval since the last request has
   * elapsed. Never rejects, so the queue cannot be broken by a failing request.
   */
  private takeTurn(): Promise<void> {
    const turn = this.gate.then(async () => {
      const waitMs = this.minIntervalMs - (Date.now() - this.lastRequestAt);
      if (waitMs > 0) {
        await delay(waitMs);
      }
      this.lastRequestAt = Date.now();
    });

    this.gate = turn;
    return turn;
  }

  private async getJson<T>(url: URL, notFoundMessage: string): Promise<T> {
    await this.takeTurn();

    const response = await fetch(url);

    // Leetify answers errors with plain text, so the status has to be checked
    // before parsing. An unknown match id comes back as a 500, indistinguishable
    // from a real outage.
    if (response.status === HttpStatus.NOT_FOUND) {
      throw new NotFoundException(notFoundMessage);
    }

    // Leetify rate limits without advertising it — no RateLimit-* headers and no
    // Retry-After. Kept separate from the 503 because it is transient and the
    // caller should back off rather than write the match off as broken.
    if (response.status === HttpStatus.TOO_MANY_REQUESTS) {
      throw new HttpException(
        'Leetify rate limit reached',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (!response.ok) {
      throw new ServiceUnavailableException(
        `Leetify API returned ${response.status}`,
      );
    }

    return (await response.json()) as T;
  }
}
