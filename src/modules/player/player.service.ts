import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '#/database/prisma.service.js';
import type { Player } from '#/generated/prisma/client.js';
import type { CreatePlayerDto } from '#/modules/player/dto/create-player.dto.js';

@Injectable()
export class PlayerService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreatePlayerDto): Promise<Player> {
    return this.prisma.player.create({ data: dto });
  }

  findAll(): Promise<Player[]> {
    return this.prisma.player.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async findOne(id: string): Promise<Player> {
    const player = await this.prisma.player.findUnique({ where: { id } });

    if (!player) {
      throw new NotFoundException(`Player with id ${id} not found`);
    }

    return player;
  }

  async findBySteamId(steamId: string): Promise<Player> {
    const player = await this.prisma.player.findUnique({ where: { steamId } });

    if (!player) {
      throw new NotFoundException(`Player with steamId ${steamId} not found`);
    }

    return player;
  }

  async remove(id: string): Promise<void> {
    await this.prisma.player.delete({ where: { id } });
  }
}
