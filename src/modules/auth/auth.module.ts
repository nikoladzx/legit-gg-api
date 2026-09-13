import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, type JwtSignOptions } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtAuthGuard } from '#/common/guards/jwt-auth.guard.js';
import { getEnv, type Env } from '#/config/env.schema.js';
import { SteamModule } from '#/integrations/steam/steam.module.js';
import { Auth } from '#/modules/auth/auth.entity.js';
import { AuthController } from '#/modules/auth/auth.controller.js';
import { AuthService } from '#/modules/auth/auth.service.js';
import { SteamOpenIdService } from '#/modules/auth/steam-openid.service.js';
import { Player } from '#/modules/player/player.entity.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Auth, Player]),
    SteamModule,
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: getEnv(config).JWT_SECRET,
        signOptions: {
          expiresIn: getEnv(config)
            .JWT_EXPIRES_IN as JwtSignOptions['expiresIn'],
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, SteamOpenIdService, JwtAuthGuard],
  exports: [AuthService],
})
export class AuthModule {}
