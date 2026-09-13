import { NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PlayerService } from '#/modules/player/player.service.js';
import { Player } from '#/modules/player/player.entity.js';

const player = {
  id: '11111111-1111-4111-8111-111111111111',
  steamId: '76561198000000000',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('PlayerService', () => {
  let service: PlayerService;
  let players: {
    create: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    find: ReturnType<typeof vi.fn>;
    findOneBy: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    players = {
      create: vi.fn(),
      save: vi.fn(),
      find: vi.fn(),
      findOneBy: vi.fn(),
      delete: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlayerService,
        { provide: getRepositoryToken(Player), useValue: players },
      ],
    }).compile();

    service = module.get(PlayerService);
  });

  describe('create', () => {
    it('creates and saves the entity, returning the row', async () => {
      players.create.mockReturnValue(player);
      players.save.mockResolvedValue(player);

      await expect(
        service.create({ steamId: player.steamId }),
      ).resolves.toEqual(player);

      expect(players.create).toHaveBeenCalledWith({
        steamId: player.steamId,
      });
      expect(players.save).toHaveBeenCalledWith(player);
    });
  });

  describe('findAll', () => {
    it('returns players newest first', async () => {
      players.find.mockResolvedValue([player]);

      await expect(service.findAll()).resolves.toEqual([player]);
      expect(players.find).toHaveBeenCalledWith({
        order: { createdAt: 'DESC' },
      });
    });
  });

  describe('findOne', () => {
    it('returns the player when it exists', async () => {
      players.findOneBy.mockResolvedValue(player);

      await expect(service.findOne(player.id)).resolves.toEqual(player);
    });

    it('throws a 404 when it does not', async () => {
      players.findOneBy.mockResolvedValue(null);

      await expect(service.findOne('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findBySteamId', () => {
    it('looks the player up by steamId', async () => {
      players.findOneBy.mockResolvedValue(player);

      await expect(service.findBySteamId(player.steamId)).resolves.toEqual(
        player,
      );
      expect(players.findOneBy).toHaveBeenCalledWith({
        steamId: player.steamId,
      });
    });

    it('throws a 404 when it does not exist', async () => {
      players.findOneBy.mockResolvedValue(null);

      await expect(
        service.findBySteamId('76561198000000001'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('delegates to players.delete', async () => {
      players.delete.mockResolvedValue({ affected: 1 });

      await expect(service.remove(player.id)).resolves.toBeUndefined();
      expect(players.delete).toHaveBeenCalledWith({ id: player.id });
    });

    it('throws a 404 when nothing was deleted', async () => {
      players.delete.mockResolvedValue({ affected: 0 });

      await expect(service.remove('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
