import { describe, expect, it } from 'vitest';
import { isUniqueViolationOn } from './errors.ts';

describe('isUniqueViolationOn', () => {
	it('matches a unique violation from the named index, on the error or any cause', () => {
		const pg = { code: '23505', constraint: 'idx_a' };
		expect(isUniqueViolationOn(pg, 'idx_a')).toBe(true);
		expect(isUniqueViolationOn({ message: 'wrapped', cause: pg }, 'idx_a')).toBe(true);
	});

	it('ignores another index, another SQLSTATE and non-errors', () => {
		expect(isUniqueViolationOn({ code: '23505', constraint: 'idx_b' }, 'idx_a')).toBe(false);
		expect(isUniqueViolationOn({ code: '23503', constraint: 'idx_a' }, 'idx_a')).toBe(false);
		expect(isUniqueViolationOn(new Error('connection reset'), 'idx_a')).toBe(false);
		expect(isUniqueViolationOn(undefined, 'idx_a')).toBe(false);
	});
});
