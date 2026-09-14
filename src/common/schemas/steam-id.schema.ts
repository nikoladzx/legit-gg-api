import { z } from 'zod';

export const steamIdSchema = z
  .string()
  .regex(/^\d{17}$/, 'steamId must be a 17-digit SteamID64 value');
