import { describe, expect, it } from 'vitest';
import { pool } from '#lib/server/db/index.ts';
import { isUniqueViolation } from './errors.ts';

describe('isUniqueViolation', () => {
	it('matches SQLSTATE 23505 on the error or any cause', () => {
		expect(isUniqueViolation({ code: '23505' })).toBe(true);
		expect(isUniqueViolation({ message: 'wrapped', cause: { cause: { code: '23505' } } })).toBe(
			true
		);
	});

	it('ignores other SQLSTATEs and non-errors', () => {
		expect(isUniqueViolation({ code: '23503' })).toBe(false);
		expect(isUniqueViolation({ code: 1062 })).toBe(false);
		expect(isUniqueViolation(new Error('boom'))).toBe(false);
		expect(isUniqueViolation(undefined)).toBe(false);
	});

	it('recognises a real unique violation from the driver', async () => {
		await pool.query('CREATE TEMP TABLE uniq_probe (id int PRIMARY KEY)');
		await pool.query('INSERT INTO uniq_probe VALUES (1)');
		const error = await pool.query('INSERT INTO uniq_probe VALUES (1)').catch((e) => e);
		expect(isUniqueViolation(error)).toBe(true);
	});
});
