import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	DELETE as signOutRoute,
	POST as signInRoute
} from '../../routes/api/auth/session/+server.ts';
import { GET as meRoute } from '../../routes/api/me/+server.ts';
import { DELETE as disconnectRoute } from '../../routes/api/me/agents/+server.ts';
import { AuthRejected, setVerifier, type Verifier } from '#lib/server/firebase.ts';
import { resetDb } from '#lib/server/test/db.ts';
import { event } from '#lib/server/test/http.ts';
import { POST as postProjectRoute } from '../../routes/api/projects/+server.ts';
import { POST as postTopicRoute } from '../../routes/api/projects/[id]/topics/+server.ts';

let revoked: string[];
let failure: 'none' | 'revoke' | 'outage';

function install(): void {
	const fake: Verifier = {
		async createSessionCookie(idToken) {
			if (failure === 'outage') throw new Error('network down');
			return `cookie-${idToken}`;
		},
		async verifySessionCookie(cookie) {
			if (failure === 'outage') throw new Error('network down');
			if (!cookie.startsWith('cookie-')) throw new AuthRejected('bad cookie');
			return { uid: cookie.slice(7), email: null, name: null };
		},
		async verifyIdToken(token) {
			if (failure === 'outage') throw new Error('network down');
			throw new AuthRejected(`bad token ${token}`);
		},
		async createCustomToken() {
			return 'custom';
		},
		async revokeRefreshTokens(uid) {
			if (failure === 'revoke') throw new Error('revoke failed');
			revoked.push(uid);
		}
	};
	setVerifier(fake, { apiKey: 'k', authDomain: 'x.firebaseapp.com', projectId: 'x' });
}

beforeEach(async () => {
	await resetDb();
	revoked = [];
	failure = 'none';
	install();
});
afterEach(() => setVerifier(undefined));

const cookie = (uid: string) => ({ cookie: `runestone_session=cookie-${uid}` });
const signOut = (headers: Record<string, string> = {}) =>
	signOutRoute(event({ method: 'DELETE', path: '/api/auth/session', headers }));

describe('sign-out', () => {
	it('revokes the signed-in user everywhere and clears the cookie', async () => {
		const res = await signOut(cookie('alice'));
		expect(revoked).toEqual(['alice']);
		expect(res.headers.get('set-cookie')).toMatch(/Max-Age=0/);
	});

	it('clears the cookie even when revocation fails, and says so', async () => {
		failure = 'revoke';
		const res = await signOut(cookie('alice'));
		expect(res.headers.get('set-cookie')).toMatch(/Max-Age=0/);
		expect((await res.json()).revoked).toBe(false);
	});

	it('revokes nothing for a request with no valid cookie', async () => {
		const res = await signOut({ cookie: 'runestone_session=forged' });
		expect(revoked).toEqual([]);
		expect(res.headers.get('set-cookie')).toMatch(/Max-Age=0/);
	});
});

describe('auth failures versus outages', () => {
	it('answers a rejected bearer 401 and a verifier outage 503', async () => {
		const bearer = { authorization: 'Bearer a.b.c' };
		const bad = await meRoute(event({ path: '/api/me', headers: bearer }));
		expect(bad.status).toBe(401);
		failure = 'outage';
		const down = await meRoute(event({ path: '/api/me', headers: bearer }));
		expect(down.status).toBe(503);
	});

	it('answers a verifier outage on a cookie 503, not signed out', async () => {
		failure = 'outage';
		const res = await meRoute(event({ path: '/api/me', headers: cookie('alice') }));
		expect(res.status).toBe(503);
	});

	it('answers an outage during sign-in 503 and a rejection 401', async () => {
		failure = 'outage';
		const body = { idToken: 'x' };
		expect(
			(await signInRoute(event({ method: 'POST', path: '/api/auth/session', body }))).status
		).toBe(503);
	});

	it('disconnects agents through the same revocation', async () => {
		const res = await disconnectRoute(
			event({ method: 'DELETE', path: '/api/me/agents', headers: cookie('alice') })
		);
		expect(res.status).toBe(200);
		expect(revoked).toEqual(['alice']);
	});
});

describe('streams of private Topics', () => {
	async function privateTopic(uid: string) {
		const project = await postProjectRoute(
			event({ method: 'POST', path: '/api/projects', body: { name: 'p' }, headers: cookie(uid) })
		);
		const { id } = await project.json();
		const topic = await postTopicRoute(
			event({
				method: 'POST',
				path: `/api/projects/${id}/topics`,
				body: { title: 'T' },
				params: { id },
				headers: cookie(uid)
			})
		);
		return (await topic.json()).topicId as string;
	}

	async function openAs(topicId: string, uid: string) {
		const { GET } = await import('../../routes/api/topics/[id]/stream/+server.ts');
		const res = await GET(
			event({
				path: `/api/topics/${topicId}/stream`,
				params: { id: topicId },
				headers: cookie(uid)
			})
		);
		return res.body!.getReader();
	}

	async function ended(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<boolean> {
		const text: string[] = [];
		const deadline = Date.now() + 2000;
		while (Date.now() < deadline) {
			const { value, done } = await reader.read();
			if (value) text.push(new TextDecoder().decode(value));
			if (done) return text.join('').includes('event: reset');
		}
		return false;
	}

	it('end when the owner signs out', async () => {
		const topicId = await privateTopic('alice');
		const reader = await openAs(topicId, 'alice');
		await signOut(cookie('alice'));
		expect(await ended(reader)).toBe(true);
	});

	it('end when the owner disconnects agents', async () => {
		const topicId = await privateTopic('alice');
		const reader = await openAs(topicId, 'alice');
		await disconnectRoute(
			event({ method: 'DELETE', path: '/api/me/agents', headers: cookie('alice') })
		);
		expect(await ended(reader)).toBe(true);
	});

	it('end even when revocation fails', async () => {
		const topicId = await privateTopic('alice');
		const reader = await openAs(topicId, 'alice');
		failure = 'revoke';
		await signOut(cookie('alice'));
		expect(await ended(reader)).toBe(true);
	});
});
