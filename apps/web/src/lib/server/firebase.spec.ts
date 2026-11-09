import { describe, expect, it } from 'vitest';
import {
	AuthRejected,
	REVOCATION_CACHE_MS,
	assertBrowserSignIn,
	withRevocationCache,
	type Verifier
} from '#lib/server/firebase.ts';

const NOW = 1_000_000_000_000;

describe('assertBrowserSignIn', () => {
	it('accepts a fresh password or federated sign-in', () => {
		expect(() =>
			assertBrowserSignIn(
				{ auth_time: NOW / 1000 - 10, firebase: { sign_in_provider: 'google.com' } },
				NOW
			)
		).not.toThrow();
	});

	it('refuses a custom-token sign-in, however fresh', () => {
		expect(() =>
			assertBrowserSignIn(
				{ auth_time: NOW / 1000 - 1, firebase: { sign_in_provider: 'custom' } },
				NOW
			)
		).toThrow(AuthRejected);
	});

	it('refuses a stale sign-in', () => {
		expect(() =>
			assertBrowserSignIn(
				{ auth_time: NOW / 1000 - 301, firebase: { sign_in_provider: 'password' } },
				NOW
			)
		).toThrow(AuthRejected);
	});
});

describe('withRevocationCache', () => {
	function counting() {
		const calls = { cookie: 0, id: 0, revoke: 0 };
		const inner: Verifier = {
			async createSessionCookie() {
				return 'c';
			},
			async verifySessionCookie() {
				calls.cookie++;
				return { uid: 'u', email: null, name: null };
			},
			async verifyIdToken() {
				calls.id++;
				return { uid: 'u', email: null, name: null };
			},
			async createCustomToken() {
				return 't';
			},
			async revokeRefreshTokens() {
				calls.revoke++;
			}
		};
		return { calls, inner };
	}

	it('checks a credential once within the window and again after it', async () => {
		let now = NOW;
		const { calls, inner } = counting();
		const check = withRevocationCache(inner, () => now);
		await check.verifySessionCookie('a');
		await check.verifySessionCookie('a');
		expect(calls.cookie).toBe(1);
		now += REVOCATION_CACHE_MS + 1;
		await check.verifySessionCookie('a');
		expect(calls.cookie).toBe(2);
	});

	it('does not share a hit between a cookie and an ID token of the same text', async () => {
		const { calls, inner } = counting();
		const check = withRevocationCache(inner, () => NOW);
		await check.verifySessionCookie('a');
		await check.verifyIdToken('a');
		expect(calls).toMatchObject({ cookie: 1, id: 1 });
	});

	it('forgets every hit when this server revokes', async () => {
		const { calls, inner } = counting();
		const check = withRevocationCache(inner, () => NOW);
		await check.verifyIdToken('a');
		await check.revokeRefreshTokens('u');
		await check.verifyIdToken('a');
		expect(calls.id).toBe(2);
	});

	it('never caches a rejection', async () => {
		let reject = true;
		const { inner } = counting();
		inner.verifyIdToken = async () => {
			if (reject) throw new AuthRejected('revoked');
			return { uid: 'u', email: null, name: null };
		};
		const check = withRevocationCache(inner, () => NOW);
		await expect(check.verifyIdToken('a')).rejects.toThrow(AuthRejected);
		reject = false;
		await expect(check.verifyIdToken('a')).resolves.toMatchObject({ uid: 'u' });
	});

	it('does not cache a verify that was in flight when its uid was revoked', async () => {
		const { calls, inner } = counting();
		let release!: () => void;
		const gate = new Promise<void>((resolve) => (release = resolve));
		inner.verifyIdToken = async () => {
			calls.id++;
			await gate;
			return { uid: 'u', email: null, name: null };
		};
		const check = withRevocationCache(inner, () => NOW);
		const inFlight = check.verifyIdToken('a');
		await check.revokeRefreshTokens('u');
		release();
		await inFlight;
		await check.verifyIdToken('a');
		expect(calls.id).toBe(2);
	});

	it('still caches a verify of another uid that raced a revoke', async () => {
		const { calls, inner } = counting();
		let release!: () => void;
		const gate = new Promise<void>((resolve) => (release = resolve));
		inner.verifyIdToken = async () => {
			calls.id++;
			await gate;
			return { uid: 'other', email: null, name: null };
		};
		const check = withRevocationCache(inner, () => NOW);
		const inFlight = check.verifyIdToken('a');
		await check.revokeRefreshTokens('u');
		release();
		await inFlight;
		await check.verifyIdToken('a');
		expect(calls.id).toBe(1);
	});

	it('caches a verify that starts after the revoke finished', async () => {
		const { calls, inner } = counting();
		const check = withRevocationCache(inner, () => NOW);
		await check.revokeRefreshTokens('u');
		await check.verifyIdToken('a');
		await check.verifyIdToken('a');
		expect(calls.id).toBe(1);
	});
});
