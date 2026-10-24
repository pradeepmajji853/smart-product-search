import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: path.join(root, '.env'), quiet: true });

// `npm start` passes --production instead of setting NODE_ENV inline, which would not
// work in the Windows shell.
if (process.argv.includes('--production') && !process.env.NODE_ENV) process.env.NODE_ENV = 'production';

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 4000,
  databaseUrl: process.env.DATABASE_URL,
  clientDist: path.join(root, 'client', 'dist'),
};
