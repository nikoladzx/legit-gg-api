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
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    players = {
      create: vi.fn(),
      save: vi.fn(),
      find: vi.fn(),
      findOneBy: vi.fn(),
      update: vi.fn(),
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

      await expect(service.findBySteamId('76561198000000001')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findStaleSteamIds', () => {
    const staleBefore = new Date('2026-08-15T00:00:00.000Z');

    it('asks for never-checked rows or rows past the cutoff, capped', async () => {
      players.find.mockResolvedValue([{ steamId: player.steamId }]);

      await expect(service.findStaleSteamIds(staleBefore, 50)).resolves.toEqual(
        [player.steamId],
      );

      const [options] = players.find.mock.calls[0];
      expect(options.take).toBe(50);
      expect(options.where[0].lastCheckedAt.type).toBe('isNull');
      expect(options.where[1].lastCheckedAt.value).toEqual(staleBefore);
    });

    it('puts never-checked players ahead of every real timestamp', async () => {
      players.find.mockResolvedValue([]);

      await service.findStaleSteamIds(staleBefore, 50);

      const [options] = players.find.mock.calls[0];
      expect(options.order).toEqual({
        lastCheckedAt: { direction: 'ASC', nulls: 'FIRST' },
        createdAt: 'ASC',
      });
    });
  });

  describe('markChecked', () => {
    it('stamps the cursor in one UPDATE, with no lookup first', async () => {
      const checkedAt = new Date('2026-09-14T10:00:00.000Z');
      players.update.mockResolvedValue({ affected: 1 });

      await expect(
        service.markChecked(player.steamId, checkedAt),
      ).resolves.toBeUndefined();

      expect(players.update).toHaveBeenCalledWith(
        { steamId: player.steamId },
        { lastCheckedAt: checkedAt },
      );
      expect(players.findOneBy).not.toHaveBeenCalled();
    });

    it('does not 404 when the player vanished mid-run, unlike remove', async () => {
      players.update.mockResolvedValue({ affected: 0 });

      await expect(
        service.markChecked(player.steamId),
      ).resolves.toBeUndefined();
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
