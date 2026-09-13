import { Module } from '@nestjs/common';
import { SteamApiService } from '#/integrations/steam/steam-api.service.js';

@Module({
  providers: [SteamApiService],
  exports: [SteamApiService],
})
export class SteamModule {}
