import {
  Controller,
  Get,
  HttpException,
  Logger,
  Query,
  Redirect,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CurrentAuth } from '#/common/decorators/current-auth.decorator.js';
import { JwtAuthGuard } from '#/common/guards/jwt-auth.guard.js';
import { ZodValidationPipe } from '#/common/pipes/zod-validation.pipe.js';
import { getEnv, type Env } from '#/config/env.schema.js';
import type { Auth } from '#/modules/auth/auth.entity.js';
import type { JwtPayload } from '#/modules/auth/auth.service.js';
import { AuthService } from '#/modules/auth/auth.service.js';
import {
  steamCallbackSchema,
  type SteamCallbackDto,
} from '#/modules/auth/dto/steam-callback.dto.js';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Get('steam')
  @Redirect()
  signIn(): { url: string } {
    return { url: this.authService.buildSteamRedirectUrl() };
  }

  @Get('steam/return')
  @Redirect()
  async callback(
    @Query(new ZodValidationPipe(steamCallbackSchema)) query: SteamCallbackDto,
  ): Promise<{ url: string }> {
    if (query['openid.mode'] === 'cancel') {
      return { url: this.frontendCallback('error', 'cancelled') };
    }

    try {
      const { accessToken } = await this.authService.signInWithSteam(query);
      return { url: this.frontendCallback('token', accessToken) };
    } catch (error) {
      this.logSignInFailure(error);
      return { url: this.frontendCallback('error', 'failed') };
    }
  }

  private frontendCallback(param: 'token' | 'error', value: string): string {
    const url = new URL('/auth/callback', getEnv(this.config).APP_BASE_URL);
    url.searchParams.set(param, value);
    return url.toString();
  }

  private logSignInFailure(error: unknown): void {
    if (error instanceof HttpException) {
      this.logger.warn(`Steam sign-in rejected: ${error.message}`);
      return;
    }

    this.logger.error(
      'Steam sign-in failed unexpectedly',
      error instanceof Error ? error.stack : String(error),
    );
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentAuth() auth: JwtPayload): Promise<Auth> {
    return this.authService.findAuthById(auth.sub);
  }
}
