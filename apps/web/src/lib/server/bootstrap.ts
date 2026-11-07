import { resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';
import { db, pool } from '#lib/server/db/index.ts';
import { backfillSlugs } from '#lib/server/store.ts';
import { pruneExpired } from '#lib/server/sessions.ts';

const CONNECT_ATTEMPTS = 30;
const CONNECT_DELAY_MS = 2_000;
const PRUNE_EVERY_MS = 3_600_000;

export async function bootstrap(): Promise<void> {
	await waitForDatabase();
	await runMigrations(pool);
	await backfillSlugs();
	setInterval(() => void pruneExpired().catch(() => {}), PRUNE_EVERY_MS).unref();
}

const MIGRATION_LOCK = 7_262_001;

// Hold the lock across the whole migrate: concurrent migrators fail.
export async function runMigrations(target: Pool): Promise<void> {
	const lock = await target.connect();
	try {
		await lock.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK]);
		await migrate(drizzle(target), { migrationsFolder: resolve('drizzle') });
	} finally {
		await lock.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK]).catch(() => {});
		lock.release();
	}
}

async function waitForDatabase(): Promise<void> {
	for (let attempt = 1; ; attempt++) {
		try {
			await db.execute(sql`select 1`);
			return;
		} catch (error) {
			if (attempt >= CONNECT_ATTEMPTS) throw error;
			console.warn(`Database not reachable (attempt ${attempt}/${CONNECT_ATTEMPTS}); retrying…`);
			await sleep(CONNECT_DELAY_MS);
		}
	}
}
