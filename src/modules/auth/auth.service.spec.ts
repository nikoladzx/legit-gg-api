import { NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Auth } from '#/modules/auth/auth.entity.js';
import { AuthService } from '#/modules/auth/auth.service.js';
import { SteamApiService } from '#/integrations/steam/steam-api.service.js';
import { SteamOpenIdService } from '#/modules/auth/steam-openid.service.js';
import { Player } from '#/modules/player/player.entity.js';

const steamId = '76561198000000000';
const player = { id: 'player-uuid', steamId };
const profile = {
  displayName: 'nikola',
  avatarUrl: 'https://avatars.steamstatic.com/abc_medium.jpg',
  avatarFullUrl: 'https://avatars.steamstatic.com/abc_full.jpg',
  profileUrl: 'https://steamcommunity.com/id/nikola/',
};
const callback = { 'openid.mode': 'id_res' };

describe('AuthService', () => {
  let service: AuthService;
  let auths: Record<string, ReturnType<typeof vi.fn>>;
  let players: Record<string, ReturnType<typeof vi.fn>>;
  let steamOpenId: { verifyCallback: ReturnType<typeof vi.fn> };
  let steamApi: { fetchProfile: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    auths = {
      create: vi.fn((input) => input),
      save: vi.fn(async (input) => ({ id: 'auth-uuid', ...input })),
      findOne: vi.fn(),
      findOneBy: vi.fn(),
    };
    players = {
      create: vi.fn((input) => input),
      save: vi.fn(async (input) => ({ id: player.id, ...input })),
      findOneBy: vi.fn(),
    };
    steamOpenId = { verifyCallback: vi.fn().mockResolvedValue(steamId) };
    steamApi = { fetchProfile: vi.fn().mockResolvedValue(profile) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(Auth), useValue: auths },
        { provide: getRepositoryToken(Player), useValue: players },
        { provide: SteamOpenIdService, useValue: steamOpenId },
        { provide: SteamApiService, useValue: steamApi },
        { provide: JwtService, useValue: { signAsync: vi.fn(async () => 'jwt') } },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  describe('signInWithSteam', () => {
    it('creates the player and auth record on a first sign-in', async () => {
      players.findOneBy.mockResolvedValue(null);
      auths.findOneBy.mockResolvedValue(null);

      const result = await service.signInWithSteam(callback);

      expect(players.save).toHaveBeenCalledWith({ steamId });
      expect(auths.save).toHaveBeenCalledWith(
        expect.objectContaining({ ...profile, playerId: player.id }),
      );
      expect(result.accessToken).toBe('jwt');
    });

    it('reuses the existing player and auth record on a repeat sign-in', async () => {
      players.findOneBy.mockResolvedValue(player);
      auths.findOneBy.mockResolvedValue({
        id: 'auth-uuid',
        playerId: player.id,
        displayName: 'old-name',
      });

      await service.signInWithSteam(callback);

      expect(players.save).not.toHaveBeenCalled();
      expect(auths.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'auth-uuid',
          displayName: profile.displayName,
        }),
      );
    });

    it('refreshes the stored profile from Steam on every sign-in', async () => {
      players.findOneBy.mockResolvedValue(player);
      auths.findOneBy.mockResolvedValue(null);

      await service.signInWithSteam(callback);

      expect(steamApi.fetchProfile).toHaveBeenCalledWith(steamId);
      expect(auths.save).toHaveBeenCalledWith(
        expect.objectContaining({ avatarUrl: profile.avatarUrl }),
      );
    });

    it('falls back to the steamId when Steam has no persona name', async () => {
      players.findOneBy.mockResolvedValue(player);
      auths.findOneBy.mockResolvedValue(null);
      steamApi.fetchProfile.mockResolvedValue({
        ...profile,
        displayName: undefined,
      });

      await service.signInWithSteam(callback);

      expect(auths.save).toHaveBeenCalledWith(
        expect.objectContaining({ displayName: steamId }),
      );
    });

    it('does not sign a token when Steam verification fails', async () => {
      steamOpenId.verifyCallback.mockRejectedValue(new Error('nope'));

      await expect(service.signInWithSteam(callback)).rejects.toThrow();
      expect(auths.save).not.toHaveBeenCalled();
    });
  });

  describe('findAuthById', () => {
    it('throws a 404 when the auth record is gone', async () => {
      auths.findOne.mockResolvedValue(null);

      await expect(service.findAuthById('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
