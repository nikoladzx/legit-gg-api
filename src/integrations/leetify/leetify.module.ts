import { Module } from '@nestjs/common';
import { LeetifyApiService } from '#/integrations/leetify/leetify-api.service.js';

@Module({
  providers: [LeetifyApiService],
  exports: [LeetifyApiService],
})
export class LeetifyModule {}
