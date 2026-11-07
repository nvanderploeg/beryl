import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db, pool } from '#lib/server/db/index.ts';

describe('connection loss', () => {
	it('survives a checked-out connection being terminated and recovers', async () => {
		const client = await pool.connect();
		const { rows } = await client.query('SELECT pg_backend_pid() AS pid');
		await client.query('BEGIN');
		await pool.query('SELECT pg_terminate_backend($1)', [rows[0].pid]);
		await expect(client.query('SELECT 1')).rejects.toMatchObject({ code: '57P01' });
		client.release(true);

		const { rows: after } = await pool.query('SELECT 1 AS ok');
		expect(after[0].ok).toBe(1);
	});

	it('fails a transaction cleanly when its backend is terminated', async () => {
		const run = db.transaction(async (tx) => {
			const { rows } = await tx.execute<{ pid: number }>(sql`SELECT pg_backend_pid() AS pid`);
			await pool.query('SELECT pg_terminate_backend($1)', [rows[0].pid]);
			await tx.execute(sql`SELECT 1`);
		});
		await expect(run).rejects.toThrow();
		expect((await pool.query('SELECT 1 AS ok')).rows[0].ok).toBe(1);
	});
});
