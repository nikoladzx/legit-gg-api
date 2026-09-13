import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getEnv, type Env } from '#/config/env.schema.js';

const STEAM_OPENID_ENDPOINT = 'https://steamcommunity.com/openid/login';
const OPENID_NS = 'http://specs.openid.net/auth/2.0';
const IDENTIFIER_SELECT = 'http://specs.openid.net/auth/2.0/identifier_select';
const CLAIMED_ID_PATTERN =
  /^https?:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/;

@Injectable()
export class SteamOpenIdService {
  constructor(private readonly config: ConfigService<Env, true>) {}

  buildRedirectUrl(): string {
    const { APP_BASE_URL } = getEnv(this.config);
    const params = new URLSearchParams({
      'openid.ns': OPENID_NS,
      'openid.mode': 'checkid_setup',
      'openid.return_to': `${APP_BASE_URL}/auth/steam/return`,
      'openid.realm': APP_BASE_URL,
      'openid.identity': IDENTIFIER_SELECT,
      'openid.claimed_id': IDENTIFIER_SELECT,
    });

    return `${STEAM_OPENID_ENDPOINT}?${params.toString()}`;
  }

  async verifyCallback(query: Record<string, string>): Promise<string> {
    if (query['openid.mode'] !== 'id_res') {
      throw new UnauthorizedException('Steam sign-in was not completed');
    }

    const claimedId = query['openid.claimed_id'];
    if (!claimedId) {
      throw new UnauthorizedException('Steam response is missing a claimed_id');
    }

    const steamId = CLAIMED_ID_PATTERN.exec(claimedId)?.[1];
    if (!steamId) {
      throw new UnauthorizedException('Steam returned an unrecognised identity');
    }

    const isValid = await this.checkAuthentication(query);
    if (!isValid) {
      throw new UnauthorizedException('Steam could not verify this sign-in');
    }

    return steamId;
  }

  private async checkAuthentication(
    query: Record<string, string>,
  ): Promise<boolean> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (key.startsWith('openid.')) {
        params.set(key, value);
      }
    }
    params.set('openid.mode', 'check_authentication');

    const response = await fetch(STEAM_OPENID_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!response.ok) {
      throw new UnauthorizedException('Steam sign-in verification failed');
    }

    const body = await response.text();
    return body
      .split('\n')
      .map((line) => line.trim())
      .includes('is_valid:true');
  }
}
