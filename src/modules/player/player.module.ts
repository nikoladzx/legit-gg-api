import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Player } from '#/modules/player/player.entity.js';
import { PlayerController } from '#/modules/player/player.controller.js';
import { PlayerService } from '#/modules/player/player.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Player])],
  controllers: [PlayerController],
  providers: [PlayerService],
  exports: [PlayerService],
})
export class PlayerModule {}
