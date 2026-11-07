import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { POST as startRoute } from '../../routes/api/auth/device/+server.ts';
import { POST as approveRoute } from '../../routes/api/auth/device/approve/+server.ts';
import { POST as tokenRoute } from '../../routes/api/auth/device/token/+server.ts';
import { GET as listRoute } from '../../routes/api/me/tokens/+server.ts';
import { DELETE as revokeRoute } from '../../routes/api/me/tokens/[id]/+server.ts';
import { POST as postProjectRoute } from '../../routes/api/projects/+server.ts';
import { POST as postTopicRoute } from '../../routes/api/projects/[id]/topics/+server.ts';
import { GET as getTopicRoute } from '../../routes/api/topics/[id]/+server.ts';
import { db } from '#lib/server/db/index.ts';
import { deviceCodes, loginTokens } from '#lib/server/db/schema.ts';
import { setVerifier } from '#lib/server/firebase.ts';
import { hashKey } from '#lib/server/hash.ts';
import { exchangeDeviceCode, normalizeUserCode } from '#lib/server/logins.ts';
import { resetDb } from '#lib/server/test/db.ts';
import { event, type Body } from '#lib/server/test/http.ts';

beforeEach(async () => {
	await resetDb();
	setVerifier({
		async createSessionCookie() {
			throw new Error('unused');
		},
		async verifySessionCookie(cookie) {
			return { uid: cookie.slice(7), email: null, name: null };
		}
	});
});
afterEach(() => setVerifier(undefined));

const as = (uid: string) => ({ cookie: `beryl_session=cookie-${uid}` });

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
	return (await poll(flow.body.deviceCode)).body.token as string;
}

describe('device login', () => {
	it('hands out a code, a verification URL on the request origin and a poll interval', async () => {
		const res = await start('claude-code on laptop');
		expect(res.status).toBe(201);
		expect(res.body.userCode).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
		expect(res.body.verificationUrl).toBe(`http://beryl.test/device?code=${res.body.userCode}`);
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
		expect(done.body.token).toMatch(/^bl_[A-Za-z0-9_-]{43}$/);
		expect(done.body.uid).toBe('alice');
		expect((await poll(flow.body.deviceCode)).status).toBe(410);
	});

	it('stores only the hash of the token', async () => {
		const token = await login('alice');
		const rows = await db.select().from(loginTokens);
		expect(rows).toHaveLength(1);
		expect(rows[0].tokenHash).toBe(hashKey(token));
		expect(JSON.stringify(rows)).not.toContain(token);
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
		await expect(exchangeDeviceCode(flow.body.deviceCode)).rejects.toMatchObject({ status: 410 });
	});
});

describe('login tokens as a bearer', () => {
	it('create owned Projects and write to them, and read their private Topics', async () => {
		const token = await login('alice');
		const created = await reply(
			postProjectRoute(
				event({ method: 'POST', path: '/api/projects', body: { name: 'Agent made' }, key: token })
			)
		);
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
		expect((await read(await login('mallory'))).status).toBe(404);
	});

	it('are refused on a Project owned by someone else', async () => {
		const alice = await login('alice');
		const mallory = await login('mallory');
		const created = await reply(
			postProjectRoute(
				event({ method: 'POST', path: '/api/projects', body: { name: 'A' }, key: alice })
			)
		);
		const id = created.body.id;
		const attempt = await reply(
			postTopicRoute(
				event({
					method: 'POST',
					path: `/api/projects/${id}/topics`,
					body: { title: 'T' },
					key: mallory,
					params: { id }
				})
			)
		);
		expect(attempt.status).toBe(403);
	});

	it('stop working once the owner revokes them, never falling back to anonymous', async () => {
		const token = await login('alice');
		const listed = await reply(listRoute(event({ path: '/api/me/tokens', headers: as('alice') })));
		expect(listed.body.tokens).toHaveLength(1);
		expect(listed.body.tokens[0].label).toBe('claude-code');
		const { id } = listed.body.tokens[0];

		const revoke = (uid: string) =>
			reply(
				revokeRoute(
					event({
						method: 'DELETE',
						path: `/api/me/tokens/${id}`,
						params: { id },
						headers: as(uid)
					})
				)
			);
		expect((await revoke('mallory')).status).toBe(404);
		expect((await revoke('alice')).status).toBe(200);

		const created = await reply(
			postProjectRoute(
				event({ method: 'POST', path: '/api/projects', body: { name: 'Anon' }, key: token })
			)
		);
		expect(created.status).toBe(401);
		expect(created.body.error).toBe('invalid login token');
	});

	it('cannot list or revoke tokens themselves', async () => {
		const token = await login('alice');
		const res = await reply(listRoute(event({ path: '/api/me/tokens', key: token })));
		expect(res.status).toBe(401);
	});
});
