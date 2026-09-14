import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThan, type Repository } from 'typeorm';
import type { CreatePlayerDto } from '#/modules/player/dto/create-player.dto.js';
import { Player } from '#/modules/player/player.entity.js';

const UPSERT_CHUNK_SIZE = 500;

@Injectable()
export class PlayerService {
  constructor(
    @InjectRepository(Player) private readonly players: Repository<Player>,
  ) {}

  create(dto: CreatePlayerDto): Promise<Player> {
    return this.players.save(this.players.create(dto));
  }

  findAll(): Promise<Player[]> {
    return this.players.find({ order: { createdAt: 'DESC' } });
  }

  async findOne(id: string): Promise<Player> {
    const player = await this.players.findOneBy({ id });
    if (!player) {
      throw new NotFoundException(`Player with id ${id} not found`);
    }
    return player;
  }

  async findBySteamId(steamId: string): Promise<Player> {
    const player = await this.players.findOneBy({ steamId });
    if (!player) {
      throw new NotFoundException(`Player with steamId ${steamId} not found`);
    }
    return player;
  }

  async findOrCreateBySteamId(steamId: string): Promise<Player> {
    const existing = await this.players.findOneBy({ steamId });
    if (existing) {
      return existing;
    }
    return this.players.save(this.players.create({ steamId }));
  }

  async ensureExist(steamIds: string[]): Promise<void> {
    const unique = [...new Set(steamIds)];
    if (!unique.length) {
      return;
    }

    for (let i = 0; i < unique.length; i += UPSERT_CHUNK_SIZE) {
      await this.players.upsert(
        unique.slice(i, i + UPSERT_CHUNK_SIZE).map((steamId) => ({ steamId })),
        { conflictPaths: ['steamId'], skipUpdateIfNoValuesChanged: true },
      );
    }
  }

  async findStaleSteamIds(staleBefore: Date, limit: number): Promise<string[]> {
    const rows = await this.players.find({
      where: [
        { lastCheckedAt: IsNull() },
        { lastCheckedAt: LessThan(staleBefore) },
      ],
      order: {
        lastCheckedAt: { direction: 'ASC', nulls: 'FIRST' },
        createdAt: 'ASC',
      },
      take: limit,
      select: { steamId: true },
    });

    return rows.map((row) => row.steamId);
  }

  async markChecked(steamId: string, checkedAt = new Date()): Promise<void> {
    await this.players.update({ steamId }, { lastCheckedAt: checkedAt });
  }

  async remove(id: string): Promise<void> {
    const result = await this.players.delete({ id });
    if (!result.affected) {
      throw new NotFoundException(`Player with id ${id} not found`);
    }
  }
}
