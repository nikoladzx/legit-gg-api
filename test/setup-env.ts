import { config as loadEnvFile } from 'dotenv';
import { assertTestDatabase } from './test-database-guard.js';

loadEnvFile({ path: '.env.test', override: true });

assertTestDatabase(process.env.DATABASE_URL);
