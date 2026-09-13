import { z } from 'zod';

export const steamCallbackSchema = z.record(z.string(), z.string());

export type SteamCallbackDto = z.infer<typeof steamCallbackSchema>;
