import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.ts';
import { log } from '#lib/server/log.ts';
import { DATABASE_URL } from '$app/env/private';

if (!DATABASE_URL) throw new Error('DATABASE_URL is not set');

export const pool = new pg.Pool({
	connectionString: DATABASE_URL,
	max: 10,
	keepAlive: true,
	connectionTimeoutMillis: 10_000
});

// Every client carries a listener for its whole life, or a dropped connection kills the process.
pool.on('connect', (client) => {
	client.on('error', (error) => log('db.client_error', { error: error.message }));
});
pool.on('error', (error) => log('db.pool_error', { error: error.message }));

export const db = drizzle(pool, { schema });
