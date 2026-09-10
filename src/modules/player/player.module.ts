import { Module } from '@nestjs/common';
import { PlayerController } from '#/modules/player/player.controller.js';
import { PlayerService } from '#/modules/player/player.service.js';

@Module({
  controllers: [PlayerController],
  providers: [PlayerService],
  exports: [PlayerService],
})
export class PlayerModule {}
