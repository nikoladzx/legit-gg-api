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
  };
}
