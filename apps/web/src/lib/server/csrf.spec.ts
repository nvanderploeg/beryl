import { describe, expect, it, vi } from 'vitest';

vi.mock('$app/env/private', async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	ORIGIN: 'https://beryl.example'
}));

const { crossSiteCookieWrite } = await import('#lib/server/origin.ts');
const { POST: signInRoute } = await import('../../routes/api/auth/session/+server.ts');
const { setVerifier } = await import('#lib/server/firebase.ts');
const { event } = await import('#lib/server/test/http.ts');

const url = new URL('http://internal:3000/api/projects');
const call = (method: string, headers: Record<string, string>) =>
	crossSiteCookieWrite(new Request(url, { method, headers }), url, 'runestone_session');
const cookie = { cookie: 'a=1; runestone_session=x' };

describe('crossSiteCookieWrite', () => {
	it('lets safe methods through', () => {
		expect(call('GET', { ...cookie, 'sec-fetch-site': 'cross-site' })).toBe(false);
	});

	it('refuses a cross-site or same-site write that carries the cookie', () => {
		expect(call('POST', { ...cookie, 'sec-fetch-site': 'cross-site' })).toBe(true);
		expect(call('DELETE', { ...cookie, 'sec-fetch-site': 'same-site' })).toBe(true);
	});

	it('accepts a same-origin fetch', () => {
		expect(call('POST', { ...cookie, 'sec-fetch-site': 'same-origin' })).toBe(false);
	});

	it('falls back to Origin against the public origin when Sec-Fetch-Site is absent', () => {
		expect(call('POST', { ...cookie, origin: 'https://beryl.example' })).toBe(false);
		expect(call('POST', { ...cookie, origin: 'https://evil.example' })).toBe(true);
		expect(call('POST', cookie)).toBe(true);
	});

	it('checks a cookie write whose Bearer is not an ID token, since the cookie authenticates it', () => {
		expect(call('POST', { authorization: 'Bearer x', ...cookie })).toBe(true);
		expect(call('POST', { authorization: 'Bearer bw_abc', ...cookie })).toBe(true);
		expect(call('POST', { authorization: 'Basic abc', ...cookie })).toBe(true);
	});

	it('leaves bearer and cookie-less requests alone', () => {
		expect(call('POST', { authorization: 'Bearer h.p.s', ...cookie })).toBe(false);
		expect(call('POST', { 'sec-fetch-site': 'cross-site' })).toBe(false);
	});
});

describe('session cookie Secure flag', () => {
	it('follows the public origin, not the request protocol', async () => {
		setVerifier(
			{
				createSessionCookie: async () => 'cookie-a',
				verifySessionCookie: async () => ({ uid: 'a', email: null, name: null }),
				verifyIdToken: async () => ({ uid: 'a', email: null, name: null }),
				createCustomToken: async () => 'c',
				revokeRefreshTokens: async () => {}
			},
			{ apiKey: 'k', authDomain: 'x', projectId: 'x' }
		);
		const res = await signInRoute(
			event({ method: 'POST', path: '/api/auth/session', body: { idToken: 'id-a' } })
		);
		setVerifier(undefined);
		expect(res.headers.get('set-cookie')).toMatch(/; Secure/);
	});
});
