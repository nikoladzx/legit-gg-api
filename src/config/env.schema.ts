import { ConfigService } from '@nestjs/config';
import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.url().startsWith('postgres'),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
  APP_BASE_URL: z.url().default('http://localhost:3000'),
  STEAM_API_KEY: z.string().min(1),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z
    .string()
    .regex(/^\d+\s*(ms|s|m|h|d|w|y)$/, 'JWT_EXPIRES_IN must be like "7d" or "15m"')
    .default('7d'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment variables:\n${details}`);
  }
  return parsed.data;
}

export function getEnv(config: ConfigService<Env, true>): Env {
  return {
    NODE_ENV: config.get('NODE_ENV', { infer: true }),
    PORT: config.get('PORT', { infer: true }),
    DATABASE_URL: config.get('DATABASE_URL', { infer: true }),
    CORS_ORIGINS: config.get('CORS_ORIGINS', { infer: true }),
    APP_BASE_URL: config.get('APP_BASE_URL', { infer: true }),
    STEAM_API_KEY: config.get('STEAM_API_KEY', { infer: true }),
    JWT_SECRET: config.get('JWT_SECRET', { infer: true }),
    JWT_EXPIRES_IN: config.get('JWT_EXPIRES_IN', { infer: true }),
  };
}
