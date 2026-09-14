import { z } from 'zod';
import { steamIdSchema } from '#/common/schemas/steam-id.schema.js';

export const createPlayerSchema = z.object({
  steamId: steamIdSchema,
});

export type CreatePlayerDto = z.infer<typeof createPlayerSchema>;
