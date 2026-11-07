import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { GET as configRoute } from '../../routes/api/auth/config/+server.ts';
import {
	DELETE as signOutRoute,
	POST as signInRoute
} from '../../routes/api/auth/session/+server.ts';
import { GET as meRoute } from '../../routes/api/me/+server.ts';
import { GET as getEventsRoute } from '../../routes/api/topics/[id]/events/+server.ts';
import { GET as streamRoute } from '../../routes/api/topics/[id]/stream/+server.ts';
import { db } from '#lib/server/db/index.ts';
import { users } from '#lib/server/db/schema.ts';
import { sessionCookie } from '#lib/server/login.ts';
import { AuthRejected, setVerifier, type LoginUser } from '#lib/server/firebase.ts';
import { listOwnedPages } from '#lib/server/store.ts';
import { resetDb } from '#lib/server/test/db.ts';
import { api, event, seedProject, seedTopic, type Body } from '#lib/server/test/http.ts';
import {
	GET as getProjectRoute,
	PATCH as patchProjectRoute
} from '../../routes/api/projects/[id]/+server.ts';
import { POST as postPairingRoute } from '../../routes/api/projects/[id]/pairings/+server.ts';
import { POST as postProjectRoute } from '../../routes/api/projects/+server.ts';
import { POST as postTopicRoute } from '../../routes/api/projects/[id]/topics/+server.ts';
import {
	GET as getTopicRoute,
	PATCH as patchTopicRoute
} from '../../routes/api/topics/[id]/+server.ts';
import { PUT as putNodesRoute } from '../../routes/api/topics/[id]/nodes/+server.ts';
import { POST as postNoteRoute } from '../../routes/api/topics/[id]/notes/+server.ts';

const fakeUser = (uid: string): LoginUser => ({ uid, email: `${uid}@example.com`, name: uid });

beforeEach(async () => {
	await resetDb();
	setVerifier(
		{
			async createSessionCookie(idToken) {
				if (!idToken.startsWith('id-')) throw new AuthRejected('bad token');
				return `cookie-${idToken.slice(3)}`;
			},
			async verifySessionCookie(cookie) {
				if (!cookie.startsWith('cookie-')) throw new AuthRejected('bad cookie');
				return fakeUser(cookie.slice(7));
			},
			async verifyIdToken() {
				throw new Error('unused');
			},
			async createCustomToken() {
				throw new Error('unused');
			},
			async revokeRefreshTokens() {}
		},
		{ apiKey: 'k', authDomain: 'x.firebaseapp.com', projectId: 'x' }
	);
});
afterEach(() => setVerifier(undefined));

const as = (uid?: string): Record<string, string> =>
	uid ? { cookie: `runestone_session=cookie-${uid}` } : {};

async function reply(response: Response | Promise<Response>) {
	const res = await response;
	return { status: res.status, body: (await res.json()) as Body, headers: res.headers };
}

const call = {
	createProject: (uid?: string, body: unknown = { name: 'Mine' }) =>
		reply(
			postProjectRoute(event({ method: 'POST', path: '/api/projects', body, headers: as(uid) }))
		),
	getProject: (id: string, uid?: string) =>
		reply(
			getProjectRoute(event({ path: `/api/projects/${id}`, params: { id }, headers: as(uid) }))
		),
	createTopic: (id: string, uid?: string, key?: string, body: unknown = { title: 'T' }) =>
		reply(
			postTopicRoute(
				event({
					method: 'POST',
					path: `/api/projects/${id}/topics`,
					body,
					key,
					params: { id },
					headers: as(uid)
				})
			)
		),
	getTopic: (id: string, uid?: string) =>
		reply(getTopicRoute(event({ path: `/api/topics/${id}`, params: { id }, headers: as(uid) }))),
	patchTopic: (id: string, body: unknown, uid?: string) =>
		reply(
			patchTopicRoute(
				event({
					method: 'PATCH',
					path: `/api/topics/${id}`,
					body,
					params: { id },
					headers: as(uid)
				})
			)
		),
	putNodes: (id: string, uid?: string) =>
		reply(
			putNodesRoute(
				event({
					method: 'PUT',
					path: `/api/topics/${id}/nodes`,
					body: { nodes: [{ path: 'a', kind: 'fact', title: 'A' }] },
					params: { id },
					headers: as(uid)
				})
			)
		),
	pairing: (id: string, uid?: string, key?: string) =>
		reply(
			postPairingRoute(
				event({
					method: 'POST',
					path: `/api/projects/${id}/pairings`,
					key,
					params: { id },
					headers: as(uid)
				})
			)
		),
	events: (id: string, uid?: string) =>
		reply(
			getEventsRoute(event({ path: `/api/topics/${id}/events`, params: { id }, headers: as(uid) }))
		),
	stream: (id: string, uid?: string) =>
		reply(
			streamRoute(event({ path: `/api/topics/${id}/stream`, params: { id }, headers: as(uid) }))
		),
	note: (id: string, key: string) =>
		reply(
			postNoteRoute(
				event({
					method: 'POST',
					path: `/api/topics/${id}/notes`,
					body: { anchor: { type: 'topic' }, intent: 'comment', text: 'hi' },
					key,
					params: { id }
				})
			)
		)
};

async function ownedTopic(uid = 'alice') {
	const created = await call.createProject(uid);
	const projectId = created.body.id as string;
	const topic = await call.createTopic(projectId, uid);
	return { projectId, topicId: topic.body.topicId as string };
}

describe('sign-in', () => {
	it('reports the web config, or that sign-in is off', async () => {
		expect((await reply(configRoute(event({ path: '/api/auth/config' })))).body).toEqual({
			enabled: true,
			config: { apiKey: 'k', authDomain: 'x.firebaseapp.com', projectId: 'x' }
		});
		setVerifier(undefined);
		expect((await reply(configRoute(event({ path: '/api/auth/config' })))).body).toEqual({
			enabled: false
		});
	});

	it('trades an ID token for an HttpOnly Strict session cookie and names the user', async () => {
		const res = await reply(
			signInRoute(
				event({ method: 'POST', path: '/api/auth/session', body: { idToken: 'id-alice' } })
			)
		);
		expect(res.status).toBe(200);
		expect(res.body.user).toEqual(fakeUser('alice'));
		const cookie = res.headers.get('set-cookie')!;
		expect(cookie).toMatch(/^runestone_session=cookie-alice;/);
		expect(cookie).toMatch(/HttpOnly/);
		expect(cookie).toMatch(/SameSite=Strict/);
		expect(cookie).not.toMatch(/Secure/);

		const me = await reply(meRoute(event({ path: '/api/me', headers: as('alice') })));
		expect(me.body.user).toEqual(fakeUser('alice'));
	});

	it('marks the cookie Secure over https', async () => {
		const request = event({
			method: 'POST',
			path: '/api/auth/session',
			body: { idToken: 'id-alice' }
		});
		const secure = { ...request, url: new URL('https://beryl.test/api/auth/session') };
		const res = await reply(signInRoute(secure as never));
		expect(res.headers.get('set-cookie')).toMatch(/Secure/);
	});

	it('refuses a bad ID token and a missing one', async () => {
		const bad = await reply(
			signInRoute(event({ method: 'POST', path: '/api/auth/session', body: { idToken: 'nope' } }))
		);
		expect(bad.status).toBe(401);
		expect(bad.headers.get('set-cookie')).toBeNull();
		const none = await reply(
			signInRoute(event({ method: 'POST', path: '/api/auth/session', body: {} }))
		);
		expect(none.status).toBe(400);
	});

	it('answers 503 when sign-in is not configured', async () => {
		setVerifier(undefined);
		const res = await reply(
			signInRoute(event({ method: 'POST', path: '/api/auth/session', body: { idToken: 'id-a' } }))
		);
		expect(res.status).toBe(503);
	});

	it('treats a forged cookie as signed out and sign-out expires the cookie', async () => {
		const me = await reply(
			meRoute(event({ path: '/api/me', headers: { cookie: 'runestone_session=forged' } }))
		);
		expect(me.body.user).toBeNull();
		const out = await reply(signOutRoute(event({ method: 'DELETE', path: '/api/auth/session' })));
		expect(out.headers.get('set-cookie')).toMatch(/Max-Age=0/);
	});
});

describe('owned Projects', () => {
	it('are created by a signed-in user, with an owner and no Write key', async () => {
		const res = await call.createProject('alice');
		expect(res.status).toBe(201);
		expect(res.body.owned).toBe(true);
		expect(res.body.writeKey).toBeUndefined();
	});

	it('take writes from the owner only', async () => {
		const { projectId, topicId } = await ownedTopic();
		expect((await call.createTopic(projectId)).status).toBe(401);
		expect((await call.createTopic(projectId, 'mallory')).status).toBe(403);
		expect((await call.putNodes(topicId)).status).toBe(401);
		expect((await call.putNodes(topicId, 'mallory')).status).toBe(403);
		expect((await call.putNodes(topicId, 'alice')).status).toBe(200);
		const rename = await reply(
			patchProjectRoute(
				event({
					method: 'PATCH',
					path: `/api/projects/${projectId}`,
					body: { name: 'Renamed' },
					params: { id: projectId },
					headers: as('alice')
				})
			)
		);
		expect(rename.status).toBe(200);
	});

	it('accept no Write key, not even a guessed hash', async () => {
		const { projectId } = await ownedTopic();
		expect((await call.createTopic(projectId, undefined, 'bw_whatever')).status).toBe(403);
	});

	it('create Topics private by default, and public when asked', async () => {
		const { projectId, topicId } = await ownedTopic();
		expect((await call.getTopic(topicId, 'alice')).body.topic.public).toBe(false);
		const open = await call.createTopic(projectId, 'alice', undefined, {
			title: 'O',
			public: true
		});
		expect(open.body.topic.public).toBe(true);
	});

	it('mint Pairing codes with the login, and the Session they redeem carries Notes only', async () => {
		const { projectId, topicId } = await ownedTopic();
		expect((await call.pairing(projectId)).status).toBe(401);
		expect((await call.pairing(projectId, 'mallory')).status).toBe(403);
		const minted = await call.pairing(projectId, 'alice');
		expect(minted.status).toBe(201);
		const session = await api.redeem({ code: minted.body.code });
		expect(session.status).toBe(200);
		expect((await call.note(topicId, session.body.token)).status).toBe(201);
		expect((await call.createTopic(projectId, undefined, session.body.token)).status).toBe(403);
	});

	it('let the signed-in owner add Notes directly', async () => {
		const { topicId } = await ownedTopic();
		const res = await reply(
			postNoteRoute(
				event({
					method: 'POST',
					path: `/api/topics/${topicId}/notes`,
					body: { anchor: { type: 'topic' }, intent: 'comment', text: 'hi' },
					params: { id: topicId },
					headers: as('alice')
				})
			)
		);
		expect(res.status).toBe(201);
	});
});

describe('private Topics', () => {
	it('are readable by the owner only, as if absent to everyone else', async () => {
		const { topicId } = await ownedTopic();
		expect((await call.getTopic(topicId, 'alice')).status).toBe(200);
		expect((await call.getTopic(topicId)).status).toBe(404);
		expect((await call.getTopic(topicId, 'mallory')).status).toBe(404);
		expect((await call.events(topicId)).status).toBe(404);
		expect((await call.events(topicId, 'alice')).status).toBe(200);
		expect((await call.stream(topicId)).status).toBe(404);
	});

	it('are left out of the Project page for anyone but the owner', async () => {
		const { projectId } = await ownedTopic();
		await call.createTopic(projectId, 'alice', undefined, { title: 'Open one', public: true });
		const titles = async (uid?: string) =>
			(await call.getProject(projectId, uid)).body.topics.map((t: Body) => t.title).sort();
		expect(await titles('alice')).toEqual(['Open one', 'T']);
		expect(await titles()).toEqual(['Open one']);
		expect(await titles('mallory')).toEqual(['Open one']);
	});

	it('turn public when the owner flips the flag, and only the owner may', async () => {
		const { topicId } = await ownedTopic();
		expect((await call.patchTopic(topicId, { public: true })).status).toBe(401);
		expect((await call.patchTopic(topicId, { public: true }, 'mallory')).status).toBe(403);
		expect((await call.patchTopic(topicId, { public: 'yes' }, 'alice')).status).toBe(400);
		const flipped = await call.patchTopic(topicId, { public: true }, 'alice');
		expect(flipped.body.topic.public).toBe(true);
		expect((await call.getTopic(topicId)).status).toBe(200);
		expect((await call.patchTopic(topicId, { public: false }, 'alice')).status).toBe(200);
		expect((await call.getTopic(topicId)).status).toBe(404);
	});

	it('are listed with their owner on the profile, newest Project first', async () => {
		await ownedTopic('alice');
		await ownedTopic('bob');
		const pages = await listOwnedPages('alice');
		expect(pages).toHaveLength(1);
		expect(pages[0].topics.map((t) => t.public)).toEqual([false]);
		expect(await listOwnedPages('nobody')).toEqual([]);
	});
});

describe('anonymous Projects', () => {
	it('keep their Write key and stay public', async () => {
		const project = await seedProject();
		const topic = await seedTopic(project);
		expect(topic.topic.public).toBe(true);
		expect((await api.getTopic(topic.topicId)).status).toBe(200);
		expect((await call.getTopic(topic.topicId, 'alice')).status).toBe(200);
	});

	it('ignore a login cookie when writing', async () => {
		const project = await seedProject();
		expect((await call.createTopic(project.id, 'alice')).status).toBe(401);
		expect((await call.createTopic(project.id, 'alice', project.writeKey)).status).toBe(201);
	});

	it('refuse to be made private', async () => {
		const project = await seedProject();
		const { topicId } = await seedTopic(project);
		const patch = await api.patchTopic(topicId, { public: false }, project.writeKey);
		expect(patch.status).toBe(400);
		const create = await api.createTopic(
			project.id,
			{ title: 'P', public: false },
			project.writeKey
		);
		expect(create.status).toBe(400);
	});
});

describe('shared cookie', () => {
	const signIn = (url = 'http://beryl.test/api/auth/session') => {
		const request = event({
			method: 'POST',
			path: '/api/auth/session',
			body: { idToken: 'id-alice' }
		});
		return reply(signInRoute({ ...request, url: new URL(url) } as never));
	};

	it('is named runestone_session and host-only when AUTH_COOKIE_DOMAIN is unset', async () => {
		const cookie = (await signIn()).headers.get('set-cookie')!;
		expect(cookie).toMatch(/^runestone_session=/);
		expect(cookie).not.toMatch(/Domain=/);
	});

	it('records the user on the first verified request, once', async () => {
		await reply(meRoute(event({ path: '/api/me', headers: as('alice') })));
		await reply(meRoute(event({ path: '/api/me', headers: as('alice') })));
		const rows = await db.select().from(users);
		expect(rows.map((r) => r.uid)).toEqual(['alice']);
		expect(rows[0].email).toBe('alice@example.com');
	});
});

describe('sessionCookie', () => {
	it('sets and clears with the same Domain', () => {
		const set = sessionCookie('v', true, 1000, '.nanzero.com');
		const clear = sessionCookie('', true, 0, '.nanzero.com');
		expect(set).toMatch(/Domain=\.nanzero\.com/);
		expect(clear).toMatch(/Domain=\.nanzero\.com/);
		expect(clear).toMatch(/Max-Age=0/);
	});
});
