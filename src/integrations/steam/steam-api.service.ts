import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getEnv, type Env } from '#/config/env.schema.js';

const PLAYER_SUMMARIES_ENDPOINT =
  'https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/';

export interface SteamProfile {
  displayName?: string;
  avatarUrl: string;
  avatarFullUrl: string;
  profileUrl: string;
}

interface PlayerSummary {
  personaname?: string;
  avatarmedium?: string;
  avatarfull?: string;
  profileurl?: string;
}

interface PlayerSummariesResponse {
  response?: { players?: PlayerSummary[] };
}

@Injectable()
export class SteamApiService {
  constructor(private readonly config: ConfigService<Env, true>) {}

  async fetchProfile(steamId: string): Promise<SteamProfile> {
    const { STEAM_API_KEY } = getEnv(this.config);
    const url = new URL(PLAYER_SUMMARIES_ENDPOINT);
    url.searchParams.set('key', STEAM_API_KEY);
    url.searchParams.set('steamids', steamId);

    const response = await fetch(url);
    if (!response.ok) {
      throw new ServiceUnavailableException('Could not reach the Steam API');
    }

    const body = (await response.json()) as PlayerSummariesResponse;
    const summary = body.response?.players?.[0];
    if (!summary) {
      throw new ServiceUnavailableException(
        'Steam returned no profile for this account',
      );
    }

    return {
      displayName: summary.personaname,
      avatarUrl: summary.avatarmedium ?? '',
      avatarFullUrl: summary.avatarfull ?? '',
      profileUrl:
        summary.profileurl ?? `https://steamcommunity.com/profiles/${steamId}`,
    };
  }
}
