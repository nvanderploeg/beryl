import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { POST as startRoute } from '../../routes/api/auth/device/+server.ts';
import { POST as lookupRoute } from '../../routes/api/auth/device/lookup/+server.ts';
import { POST as approveRoute } from '../../routes/api/auth/device/approve/+server.ts';
import { POST as tokenRoute } from '../../routes/api/auth/device/token/+server.ts';
import { DELETE as disconnectRoute } from '../../routes/api/me/agents/+server.ts';
import { POST as postProjectRoute } from '../../routes/api/projects/+server.ts';
import { POST as postTopicRoute } from '../../routes/api/projects/[id]/topics/+server.ts';
import { GET as getTopicRoute } from '../../routes/api/topics/[id]/+server.ts';
import { db } from '#lib/server/db/index.ts';
import { deviceCodes } from '#lib/server/db/schema.ts';
import { AuthRejected, setVerifier } from '#lib/server/firebase.ts';
import { exchangeDeviceCode, limitPoll, normalizeUserCode } from '#lib/server/logins.ts';
import { resetDb } from '#lib/server/test/db.ts';
import { event, type Body } from '#lib/server/test/http.ts';

const revoked = new Set<string>();

beforeEach(async () => {
	await resetDb();
	revoked.clear();
	setVerifier(
		{
			async createSessionCookie() {
				throw new Error('unused');
			},
			async verifySessionCookie(cookie) {
				return { uid: cookie.slice(7), email: null, name: null };
			},
			async verifyIdToken(idToken) {
				const uid = idToken.split('.')[1];
				if (revoked.has(uid)) throw new AuthRejected('revoked');
				return { uid, email: null, name: null };
			},
			async createCustomToken(uid) {
				return `custom-${uid}`;
			},
			async revokeRefreshTokens(uid) {
				revoked.add(uid);
			}
		},
		{ apiKey: 'web-key', authDomain: 'x.firebaseapp.com', projectId: 'x' }
	);
});
afterEach(() => setVerifier(undefined));

const idToken = (uid: string) => `h.${uid}.s`;

const as = (uid: string) => ({ cookie: `runestone_session=cookie-${uid}` });

async function reply(response: Response | Promise<Response>) {
	const res = await response;
	return { status: res.status, body: (await res.json()) as Body };
}

const start = (label?: string) =>
	reply(
		startRoute(event({ method: 'POST', path: '/api/auth/device', body: label ? { label } : {} }))
	);
const approve = (userCode: string, uid?: string) =>
	reply(
		approveRoute(
			event({
				method: 'POST',
				path: '/api/auth/device/approve',
				body: { userCode },
				headers: uid ? as(uid) : {}
			})
		)
	);
const poll = (deviceCode: string) =>
	reply(
		tokenRoute(event({ method: 'POST', path: '/api/auth/device/token', body: { deviceCode } }))
	);

async function login(uid: string, label = 'claude-code') {
	const flow = await start(label);
	await approve(flow.body.userCode, uid);
	expect((await poll(flow.body.deviceCode)).body.customToken).toBe(`custom-${uid}`);
	return idToken(uid);
}

describe('device login', () => {
	it('hands out a code, a code-free verification URL on the request origin and a poll interval', async () => {
		const res = await start('claude-code on laptop');
		expect(res.status).toBe(201);
		expect(res.body.userCode).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
		expect(res.body.verificationUrl).toBe('http://beryl.test/device');
		expect(res.body.deviceCode).toMatch(/^bd_[A-Za-z0-9_-]{43}$/);
		expect(res.body.interval).toBeGreaterThan(0);
	});

	it('answers pending until a signed-in person approves, then hands the token over once', async () => {
		const flow = await start();
		expect(await poll(flow.body.deviceCode)).toEqual({ status: 202, body: { pending: true } });
		expect((await approve(flow.body.userCode)).status).toBe(401);
		expect((await poll(flow.body.deviceCode)).status).toBe(202);

		const approved = await approve(flow.body.userCode, 'alice');
		expect(approved.status).toBe(200);
		const done = await poll(flow.body.deviceCode);
		expect(done.status).toBe(200);
		expect(done.body).toEqual({ uid: 'alice', customToken: 'custom-alice', apiKey: 'web-key' });
		expect((await poll(flow.body.deviceCode)).status).toBe(410);
	});

	it('approves a code once, tolerating how a person types it', async () => {
		const flow = await start();
		const typed = flow.body.userCode.toLowerCase().replace('-', ' ');
		expect(normalizeUserCode(typed)).toBe(flow.body.userCode);
		expect((await approve(typed, 'alice')).status).toBe(200);
		expect((await approve(flow.body.userCode, 'mallory')).status).toBe(404);
		expect((await poll(flow.body.deviceCode)).body.uid).toBe('alice');
	});

	it('refuses an unknown or expired code', async () => {
		expect((await approve('ZZZZ-ZZZZ', 'alice')).status).toBe(404);
		expect((await poll('bd_nope')).status).toBe(410);
		const flow = await start();
		await db
			.update(deviceCodes)
			.set({ expiresAt: new Date(Date.now() - 1000) })
			.where(eq(deviceCodes.userCode, flow.body.userCode));
		expect((await approve(flow.body.userCode, 'alice')).status).toBe(404);
		await expect(exchangeDeviceCode(flow.body.deviceCode, async () => 't')).rejects.toMatchObject({
			status: 410
		});
	});
});

const lookup = (userCode: string, uid?: string) =>
	reply(
		lookupRoute(
			event({
				method: 'POST',
				path: '/api/auth/device/lookup',
				body: { userCode },
				headers: uid ? { ...as(uid), 'user-agent': 'x' } : {}
			})
		)
	);

describe('device login hardening', () => {
	it('shows a signed-in person where the request came from and how long ago', async () => {
		const flow = (
			await reply(
				startRoute(
					event({
						method: 'POST',
						path: '/api/auth/device',
						body: { label: 'claude-code' },
						headers: { 'user-agent': 'node-fetch/1.0' }
					})
				)
			)
		).body;
		expect((await lookup(flow.userCode)).status).toBe(401);
		const seen = await lookup(flow.userCode.toLowerCase(), 'alice');
		expect(seen.status).toBe(200);
		expect(seen.body).toMatchObject({
			label: 'claude-code',
			ip: '10.0.0.1',
			userAgent: 'node-fetch/1.0'
		});
		expect(seen.body.startedSecondsAgo).toBeGreaterThanOrEqual(0);
		expect((await lookup('ZZZZ-ZZZZ', 'alice')).status).toBe(404);
	});

	it('limits lookups per address', async () => {
		let last = 0;
		for (let i = 0; i < 11; i++) last = (await lookup('ZZZZ-ZZZZ', 'alice')).status;
		expect(last).toBe(429);
	});

	it('limits approvals per address', async () => {
		let last = { status: 0, body: {} as Body };
		for (let i = 0; i < 11; i++) last = await approve('ZZZZ-ZZZZ', 'alice');
		expect(last.status).toBe(429);
	});

	it('limits polling per device code and says when to retry', async () => {
		const flow = await start();
		let res: Response | undefined;
		for (let i = 0; i < 31; i++) {
			res = await tokenRoute(
				event({
					method: 'POST',
					path: '/api/auth/device/token',
					body: { deviceCode: flow.body.deviceCode }
				})
			);
		}
		expect(res!.status).toBe(429);
		expect(Number(res!.headers.get('retry-after'))).toBeGreaterThan(0);
		expect(() => limitPoll('bd_other')).not.toThrow();
	});

	it('keeps the approval when minting the custom token fails', async () => {
		const flow = await start();
		await approve(flow.body.userCode, 'alice');
		await expect(
			exchangeDeviceCode(flow.body.deviceCode, async () => {
				throw new Error('firebase down');
			})
		).rejects.toThrow('firebase down');
		expect(await exchangeDeviceCode(flow.body.deviceCode, async (uid) => uid)).toEqual({
			uid: 'alice',
			minted: 'alice'
		});
	});
});

describe('ID token bearers', () => {
	const createProject = (key?: string) =>
		reply(
			postProjectRoute(
				event({ method: 'POST', path: '/api/projects', body: { name: 'Agent made' }, key })
			)
		);

	it('create owned Projects and write to them, and read their private Topics', async () => {
		const token = await login('alice');
		const created = await createProject(token);
		expect(created.status).toBe(201);
		expect(created.body.owned).toBe(true);
		expect(created.body.writeKey).toBeUndefined();

		const id = created.body.id;
		const topic = await reply(
			postTopicRoute(
				event({
					method: 'POST',
					path: `/api/projects/${id}/topics`,
					body: { title: 'T' },
					key: token,
					params: { id }
				})
			)
		);
		expect(topic.status).toBe(201);
		const topicId = topic.body.topicId;
		const read = (key?: string) =>
			reply(getTopicRoute(event({ path: `/api/topics/${topicId}`, key, params: { id: topicId } })));
		expect((await read(token)).status).toBe(200);
		expect((await read()).status).toBe(404);
		expect((await read(idToken('mallory'))).status).toBe(404);
	});

	it('are refused on a Project owned by someone else', async () => {
		const id = (await createProject(idToken('alice'))).body.id;
		const attempt = await reply(
			postTopicRoute(
				event({
					method: 'POST',
					path: `/api/projects/${id}/topics`,
					body: { title: 'T' },
					key: idToken('mallory'),
					params: { id }
				})
			)
		);
		expect(attempt.status).toBe(403);
	});

	it('stop working once the user disconnects agents, never falling back to anonymous', async () => {
		const token = idToken('alice');
		expect((await createProject(token)).status).toBe(201);
		const out = await reply(
			disconnectRoute(event({ method: 'DELETE', path: '/api/me/agents', headers: as('alice') }))
		);
		expect(out.status).toBe(200);
		const after = await createProject(token);
		expect(after.status).toBe(401);
		expect(after.body.error).toBe('invalid login token');
	});

	it('can sign themselves out everywhere, and a stranger cannot', async () => {
		const own = await reply(
			disconnectRoute(event({ method: 'DELETE', path: '/api/me/agents', key: idToken('alice') }))
		);
		expect(own.status).toBe(200);
		expect(revoked.has('alice')).toBe(true);
		const anonymous = await reply(
			disconnectRoute(event({ method: 'DELETE', path: '/api/me/agents' }))
		);
		expect(anonymous.status).toBe(401);
	});

	it('leave Write keys and Session tokens alone', async () => {
		const anonymous = await createProject();
		expect(anonymous.body.owned).toBe(false);
		expect(anonymous.body.writeKey).toMatch(/^bw_/);
	});
});
