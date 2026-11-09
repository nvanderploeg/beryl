import { afterEach, describe, expect, it } from 'vitest';
import { ApiError } from '#lib/server/api.ts';
import { AuthRejected, setVerifier } from '#lib/server/firebase.ts';
import { load } from './+layout.server.ts';

const verifier = (verify: () => Promise<never>) => ({
	createSessionCookie: async () => 'c',
	verifySessionCookie: verify,
	verifyIdToken: verify,
	createCustomToken: async () => 't',
	revokeRefreshTokens: async () => {}
});
const run = (headers: Record<string, string>) =>
	(load as (e: unknown) => Promise<{ user: unknown }>)({
		request: new Request('http://x/', { headers })
	});

afterEach(() => setVerifier(undefined));

describe('layout load', () => {
	it('treats a verifier outage as signed out', async () => {
		setVerifier(verifier(async () => Promise.reject(new Error('network down'))));
		await expect(run({ cookie: 'runestone_session=x' })).resolves.toMatchObject({ user: null });
	});

	it('still surfaces a rejected ID token Bearer', async () => {
		setVerifier(verifier(async () => Promise.reject(new AuthRejected('bad'))));
		const error = await run({ authorization: 'Bearer h.p.s' }).catch((e) => e);
		expect(error).toBeInstanceOf(ApiError);
		expect(error.status).toBe(401);
	});
});
