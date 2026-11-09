import { describe, expect, it } from 'vitest';
import { parseOwnerTarget } from './parse.ts';

const refused = (body: Record<string, unknown>) => {
	try {
		parseOwnerTarget(body);
	} catch (error) {
		return (error as { status: number }).status;
	}
	return undefined;
};

describe('parseOwnerTarget', () => {
	it('accepts a uid as given', () => {
		expect(parseOwnerTarget({ uid: 'AbC123xyz_-.:' })).toEqual({ uid: 'AbC123xyz_-.:' });
	});

	it('accepts an email, trimmed', () => {
		expect(parseOwnerTarget({ email: '  a@b.co ' })).toEqual({ email: 'a@b.co' });
	});

	it('wants exactly one of uid and email', () => {
		expect(refused({})).toBe(400);
		expect(refused({ uid: 'u', email: 'a@b.co' })).toBe(400);
	});

	it('refuses malformed values', () => {
		expect(refused({ uid: '' })).toBe(400);
		expect(refused({ uid: 'x'.repeat(129) })).toBe(400);
		expect(refused({ uid: 'has space' })).toBe(400);
		expect(refused({ uid: 5 })).toBe(400);
		expect(refused({ email: 'nope' })).toBe(400);
		expect(refused({ email: 'a b@c.d' })).toBe(400);
		expect(refused({ email: 7 })).toBe(400);
	});
});
