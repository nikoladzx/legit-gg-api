import { z } from 'zod';

export const matchIdSchema = z.uuid('matchId must be a UUID');
