import { describe, expect, it } from 'vitest';
import { safeNext } from './auth.ts';

describe('safeNext', () => {
	it('keeps same-origin paths', () => {
		expect(safeNext('/profile')).toBe('/profile');
		expect(safeNext('/p/a/t/b?x=1')).toBe('/p/a/t/b?x=1');
	});

	it('falls back to the home page for anything that could leave the site', () => {
		for (const raw of [null, '', 'https://evil.test', '//evil.test', '/\\evil.test', 'profile']) {
			expect(safeNext(raw)).toBe('/');
		}
	});
});
