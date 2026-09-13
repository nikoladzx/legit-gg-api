import { Injectable, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import type { SteamProfile } from '#/integrations/steam/steam-api.service.js';
import { SteamApiService } from '#/integrations/steam/steam-api.service.js';
import { Auth } from '#/modules/auth/auth.entity.js';
import { SteamOpenIdService } from '#/modules/auth/steam-openid.service.js';
import { Player } from '#/modules/player/player.entity.js';

export interface JwtPayload {
  sub: string;
  playerId: string;
  steamId: string;
}

export interface SignInResult {
  accessToken: string;
  auth: Auth;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(Auth) private readonly auths: Repository<Auth>,
    @InjectRepository(Player) private readonly players: Repository<Player>,
    private readonly steamOpenId: SteamOpenIdService,
    private readonly steamApi: SteamApiService,
    private readonly jwt: JwtService,
  ) {}

  buildSteamRedirectUrl(): string {
    return this.steamOpenId.buildRedirectUrl();
  }

  async signInWithSteam(query: Record<string, string>): Promise<SignInResult> {
    const steamId = await this.steamOpenId.verifyCallback(query);
    const profile = await this.steamApi.fetchProfile(steamId);
    const auth = await this.upsertAuth(steamId, profile);

    return {
      accessToken: await this.jwt.signAsync({
        sub: auth.id,
        playerId: auth.playerId,
        steamId,
      } satisfies JwtPayload),
      auth,
    };
  }

  async findAuthById(id: string): Promise<Auth> {
    const auth = await this.auths.findOne({
      where: { id },
      relations: { player: true },
    });
    if (!auth) {
      throw new NotFoundException(`Auth with id ${id} not found`);
    }
    return auth;
  }

  private async upsertAuth(
    steamId: string,
    profile: SteamProfile,
  ): Promise<Auth> {
    const player = await this.findOrCreatePlayer(steamId);
    const existing = await this.auths.findOneBy({ playerId: player.id });

    const auth = this.auths.create({
      ...existing,
      ...profile,
      displayName: profile.displayName ?? steamId,
      playerId: player.id,
      lastLoginAt: new Date(),
    });

    const saved = await this.auths.save(auth);
    saved.player = player;
    return saved;
  }

  private async findOrCreatePlayer(steamId: string): Promise<Player> {
    const existing = await this.players.findOneBy({ steamId });
    if (existing) {
      return existing;
    }
    return this.players.save(this.players.create({ steamId }));
  }
}
