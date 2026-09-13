import { Controller, Get, Query, Redirect, UseGuards } from '@nestjs/common';
import { CurrentAuth } from '#/common/decorators/current-auth.decorator.js';
import { JwtAuthGuard } from '#/common/guards/jwt-auth.guard.js';
import { ZodValidationPipe } from '#/common/pipes/zod-validation.pipe.js';
import type { Auth } from '#/modules/auth/auth.entity.js';
import type { JwtPayload, SignInResult } from '#/modules/auth/auth.service.js';
import { AuthService } from '#/modules/auth/auth.service.js';
import {
  steamCallbackSchema,
  type SteamCallbackDto,
} from '#/modules/auth/dto/steam-callback.dto.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('steam')
  @Redirect()
  signIn(): { url: string } {
    return { url: this.authService.buildSteamRedirectUrl() };
  }

  @Get('steam/return')
  callback(
    @Query(new ZodValidationPipe(steamCallbackSchema)) query: SteamCallbackDto,
  ): Promise<SignInResult> {
    return this.authService.signInWithSteam(query);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentAuth() auth: JwtPayload): Promise<Auth> {
    return this.authService.findAuthById(auth.sub);
  }
}
