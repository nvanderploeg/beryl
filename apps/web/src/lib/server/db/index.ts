import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.ts';
import { DATABASE_URL } from '$app/env/private';

if (!DATABASE_URL) throw new Error('DATABASE_URL is not set');

export const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 10 });

// An idle client erroring would otherwise crash the process as an unhandled 'error' event.
pool.on('error', () => {});

export const db = drizzle(pool, { schema });
