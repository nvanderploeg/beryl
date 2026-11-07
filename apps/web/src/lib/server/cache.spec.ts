import { describe, expect, it } from 'vitest';
import { varyOnLogin } from '#lib/server/cache.ts';

describe('varyOnLogin', () => {
	it('marks a bare response private and varying on the login', () => {
		const res = varyOnLogin(Response.json({}));
		expect(res.headers.get('cache-control')).toBe('private');
		expect(res.headers.get('vary')).toBe('Cookie, Authorization');
	});

	it('keeps an explicit cache-control and merges into an existing Vary', () => {
		const res = varyOnLogin(
			new Response('x', {
				headers: { 'cache-control': 'no-store', vary: 'accept-encoding, cookie' }
			})
		);
		expect(res.headers.get('cache-control')).toBe('no-store');
		expect(res.headers.get('vary')).toBe('accept-encoding, cookie, Authorization');
	});

	it('copes with immutable headers', () => {
		const res = varyOnLogin(Response.redirect('http://x.test/', 303));
		expect(res.headers.get('vary')).toContain('Cookie');
	});
});
