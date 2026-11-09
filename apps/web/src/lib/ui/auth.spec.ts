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

	it('rejects control characters that browsers strip into a protocol-relative URL', () => {
		for (const raw of ['/\t/evil.test', '/\n/evil.test', '/\r/evil.test', '/\u0000/evil.test']) {
			expect(safeNext(raw)).toBe('/');
		}
	});

	it('rejects a percent-encoded tab once decoded from the query string', () => {
		const next = new URLSearchParams('next=/%09/evil.test').get('next');
		expect(safeNext(next)).toBe('/');
	});

	it('keeps paths that merely contain encoded characters', () => {
		expect(safeNext('/a%2F%2Fb')).toBe('/a%2F%2Fb');
	});
});
