import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '#lib/server/db/index.ts';
import { users } from '#lib/server/db/schema.ts';
import { AuthRejected, setVerifier } from '#lib/server/firebase.ts';
import { listProjects } from '#lib/server/admin/portal.ts';
import { resetDb } from '#lib/server/test/db.ts';
import { api, event, seedProject, seedTopic, type Body } from '#lib/server/test/http.ts';
import { PATCH as assignRoute } from '../../routes/api/admin/projects/[id]/+server.ts';
import {
	DELETE as clearKeyRoute,
	POST as rotateKeyRoute
} from '../../routes/api/projects/[id]/key/+server.ts';
import { POST as postProjectRoute } from '../../routes/api/projects/+server.ts';

beforeEach(async () => {
	await resetDb();
	setVerifier(
		{
			createSessionCookie: async () => 'x',
			verifySessionCookie: async (cookie) => {
				if (!cookie.startsWith('cookie-')) throw new AuthRejected('bad');
				const uid = cookie.slice(7);
				return { uid, email: `${uid}@example.com`, name: uid };
			},
			verifyIdToken: async () => {
				throw new AuthRejected('unused');
			},
			createCustomToken: async () => 'c',
			revokeRefreshTokens: async () => {}
		},
		{ apiKey: 'k', authDomain: 'x', projectId: 'x' }
	);
});
afterEach(() => setVerifier(undefined));

const as = (uid: string) => ({ cookie: `runestone_session=cookie-${uid}` });

async function reply(response: Response | Promise<Response>) {
	const res = await response;
	const text = await res.text();
	return { status: res.status, body: (text ? JSON.parse(text) : {}) as Body };
}

const assign = (id: string, body: unknown, admin = true) =>
	reply(
		assignRoute({
			...event({ method: 'PATCH', path: `/api/admin/projects/${id}`, body, params: { id } }),
			locals: admin ? { admin: { csrf: 'x' } } : {}
		} as never)
	);

const keyCall = (method: 'POST' | 'DELETE', id: string, headers: Record<string, string> = {}) =>
	reply(
		(method === 'POST' ? rotateKeyRoute : clearKeyRoute)(
			event({ method, path: `/api/projects/${id}/key`, params: { id }, headers })
		)
	);

const signedIn = (email: string, uid: string) =>
	db.insert(users).values({ uid, email, name: uid }).onConflictDoNothing();

describe('admin assigns an Owner', () => {
	it('is refused without the admin gate', async () => {
		const project = await seedProject();
		expect((await assign(project.id, { uid: 'alice' }, false)).status).not.toBe(200);
	});

	it('resolves an email case-insensitively to a user who has signed in', async () => {
		await signedIn('Alice@Example.com', 'alice');
		const project = await seedProject();
		const res = await assign(project.id, { email: 'alice@example.COM' });
		expect(res.status).toBe(200);
		expect(res.body).toEqual({ id: project.id, ownerUid: 'alice', previousOwnerUid: null });
	});

	it('tells the Admin an unknown email must sign in first', async () => {
		const project = await seedProject();
		const res = await assign(project.id, { email: 'ghost@example.com' });
		expect(res.status).toBe(404);
		expect(res.body.error).toMatch(/sign in/);
	});

	it('asks for a uid when two users share an email', async () => {
		await signedIn('twin@example.com', 'a');
		await signedIn('twin@example.com', 'b');
		const project = await seedProject();
		expect((await assign(project.id, { email: 'twin@example.com' })).status).toBe(409);
	});

	it('takes a uid as given and 404s an unknown Project', async () => {
		const project = await seedProject();
		expect((await assign(project.id, { uid: 'nobody-yet' })).body.ownerUid).toBe('nobody-yet');
		const missing = await assign('00000000-0000-4000-8000-000000000000', { uid: 'u' });
		expect(missing.status).toBe(404);
	});

	it('reassigns an owned Project and lists the new owner', async () => {
		await signedIn('bob@example.com', 'bob');
		const created = await reply(
			postProjectRoute(
				event({ method: 'POST', path: '/api/projects', body: {}, headers: as('alice') })
			)
		);
		const id = created.body.id as string;
		const res = await assign(id, { email: 'bob@example.com' });
		expect(res.body).toEqual({ id, ownerUid: 'bob', previousOwnerUid: 'alice' });
		const listed = (await listProjects()).find((p) => p.id === id)!;
		expect(listed).toMatchObject({ ownerUid: 'bob', ownerEmail: 'bob@example.com' });
	});

	it('keeps the Write key working on the newly owned Project', async () => {
		const project = await seedProject();
		await assign(project.id, { uid: 'alice' });
		const topic = await api.createTopic(project.id, { title: 'T', public: true }, project.writeKey);
		expect(topic.status).toBe(201);
		const put = await api.putNodes(
			topic.body.topicId,
			{ nodes: [{ path: 'a', kind: 'fact', title: 'A' }] },
			project.writeKey
		);
		expect(put.status).toBe(200);
		expect((await api.createPairing(project.id, project.writeKey)).status).toBe(201);
		expect((await api.createPairing(project.id, 'bw_wrong')).status).toBe(403);
		expect((await listProjects()).find((p) => p.id === project.id)!.hasWriteKey).toBe(true);
	});

	it('keeps private Topics away from the Write key', async () => {
		const project = await seedProject();
		await assign(project.id, { uid: 'alice' });
		const publicTopic = (await seedTopic(project)).topicId;

		const refusedPrivate = await api.createTopic(
			project.id,
			{ title: 'P', public: false },
			project.writeKey
		);
		expect(refusedPrivate.status).toBe(403);
		const refusedDefault = await api.createTopic(project.id, { title: 'P' }, project.writeKey);
		expect(refusedDefault.status).toBe(403);
		const hide = await api.patchTopic(publicTopic, { public: false }, project.writeKey);
		expect(hide.status).toBe(403);
	});
});

describe('Owner rotates the Write key', () => {
	async function assigned() {
		const project = await seedProject();
		await assign(project.id, { uid: 'alice' });
		return project;
	}

	it('mints a new key and retires the old one', async () => {
		const project = await assigned();
		const res = await keyCall('POST', project.id, as('alice'));
		expect(res.status).toBe(200);
		expect(res.body.writeKey).toMatch(/^bw_/);
		expect((await api.createPairing(project.id, project.writeKey)).status).toBe(403);
		expect((await api.createPairing(project.id, res.body.writeKey)).status).toBe(201);
	});

	it('clears the key', async () => {
		const project = await assigned();
		expect((await keyCall('DELETE', project.id, as('alice'))).status).toBe(204);
		expect((await api.createPairing(project.id, project.writeKey)).status).toBe(403);
		expect((await listProjects()).find((p) => p.id === project.id)!.hasWriteKey).toBe(false);
	});

	it('is the Owner login only', async () => {
		const project = await assigned();
		expect((await keyCall('POST', project.id)).status).toBe(401);
		expect((await keyCall('POST', project.id, as('mallory'))).status).toBe(403);
		const viaKey = await reply(
			rotateKeyRoute(
				event({
					method: 'POST',
					path: `/api/projects/${project.id}/key`,
					key: project.writeKey,
					params: { id: project.id }
				})
			)
		);
		expect(viaKey.status).toBe(401);
	});

	it('refuses an anonymous Project', async () => {
		const project = await seedProject();
		expect((await keyCall('POST', project.id, as('alice'))).status).toBe(403);
	});
});
