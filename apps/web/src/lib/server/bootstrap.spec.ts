import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { DATABASE_URL } from '$app/env/private';
import { runMigrations } from '#lib/server/bootstrap.ts';

const name = 'beryl_boot_test';
const url = new URL(DATABASE_URL);
url.pathname = `/${name}`;

describe('runMigrations', () => {
	const admin = new pg.Pool({ connectionString: DATABASE_URL, max: 1 });
	let fresh: pg.Pool;

	beforeAll(async () => {
		await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
		await admin.query(`CREATE DATABASE ${name}`);
		fresh = new pg.Pool({ connectionString: url.toString(), max: 10 });
	});
	afterAll(async () => {
		await fresh.end();
		await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
		await admin.end();
	});

	it('lets concurrent bootstraps on an empty database all succeed', async () => {
		await Promise.all(Array.from({ length: 5 }, () => runMigrations(fresh)));
		const { rows } = await fresh.query(
			'SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations'
		);
		expect(rows[0].n).toBe(1);
	});
});
