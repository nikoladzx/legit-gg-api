import { NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { PrismaService } from '#/database/prisma.service.js';
import { PlayerService } from '#/modules/player/player.service.js';

const player = {
  id: '11111111-1111-4111-8111-111111111111',
  steamId: '76561198000000000',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('PlayerService', () => {
  let service: PlayerService;
  let prisma: {
    player: {
      create: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(async () => {
    prisma = {
      player: {
        create: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        delete: vi.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [PlayerService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(PlayerService);
  });

  describe('create', () => {
    it('passes the dto straight to prisma and returns the row', async () => {
      prisma.player.create.mockResolvedValue(player);

      await expect(
        service.create({ steamId: player.steamId }),
      ).resolves.toEqual(player);

      expect(prisma.player.create).toHaveBeenCalledWith({
        data: { steamId: player.steamId },
      });
    });
  });

  describe('findAll', () => {
    it('returns players newest first', async () => {
      prisma.player.findMany.mockResolvedValue([player]);

      await expect(service.findAll()).resolves.toEqual([player]);
      expect(prisma.player.findMany).toHaveBeenCalledWith({
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('findOne', () => {
    it('returns the player when it exists', async () => {
      prisma.player.findUnique.mockResolvedValue(player);

      await expect(service.findOne(player.id)).resolves.toEqual(player);
    });

    it('throws a 404 when it does not', async () => {
      prisma.player.findUnique.mockResolvedValue(null);

      await expect(service.findOne('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findBySteamId', () => {
    it('looks the player up by steamId', async () => {
      prisma.player.findUnique.mockResolvedValue(player);

      await expect(service.findBySteamId(player.steamId)).resolves.toEqual(
        player,
      );
      expect(prisma.player.findUnique).toHaveBeenCalledWith({
        where: { steamId: player.steamId },
      });
    });

    it('throws a 404 when it does not exist', async () => {
      prisma.player.findUnique.mockResolvedValue(null);

      await expect(service.findBySteamId('76561198000000001')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('delegates to prisma.player.delete', async () => {
      prisma.player.delete.mockResolvedValue(player);

      await expect(service.remove(player.id)).resolves.toBeUndefined();
      expect(prisma.player.delete).toHaveBeenCalledWith({
        where: { id: player.id },
      });
    });
  });
});
