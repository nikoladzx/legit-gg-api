import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ZodValidationPipe } from '#/common/pipes/zod-validation.pipe.js';
import {
  createPlayerSchema,
  type CreatePlayerDto,
} from '#/modules/player/dto/create-player.dto.js';
import type { Player } from '#/modules/player/player.entity.js';
import { PlayerService } from '#/modules/player/player.service.js';

@Controller('players')
export class PlayerController {
  constructor(private readonly playerService: PlayerService) {}

  @Post()
  create(
    @Body(new ZodValidationPipe(createPlayerSchema)) dto: CreatePlayerDto,
  ): Promise<Player> {
    return this.playerService.create(dto);
  }

  @Get()
  findAll(): Promise<Player[]> {
    return this.playerService.findAll();
  }

  @Get('steam/:steamId')
  findBySteamId(@Param('steamId') steamId: string): Promise<Player> {
    return this.playerService.findBySteamId(steamId);
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<Player> {
    return this.playerService.findOne(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string): Promise<void> {
    return this.playerService.remove(id);
  }
}
