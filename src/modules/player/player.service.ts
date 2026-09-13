import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import type { CreatePlayerDto } from '#/modules/player/dto/create-player.dto.js';
import { Player } from '#/modules/player/player.entity.js';

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

  async remove(id: string): Promise<void> {
    const result = await this.players.delete({ id });
    if (!result.affected) {
      throw new NotFoundException(`Player with id ${id} not found`);
    }
  }
}
