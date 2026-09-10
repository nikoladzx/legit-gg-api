import { z } from 'zod';

export const createPlayerSchema = z.object({
  steamId: z
    .string()
    .regex(/^\d{17}$/, 'steamId must be a 17-digit SteamID64 value'),
});

export type CreatePlayerDto = z.infer<typeof createPlayerSchema>;
