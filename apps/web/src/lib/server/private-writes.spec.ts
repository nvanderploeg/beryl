import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AuthRejected, setVerifier } from '#lib/server/firebase.ts';
import { resetDb } from '#lib/server/test/db.ts';
import { api, event } from '#lib/server/test/http.ts';
import { POST as postProjectRoute } from '../../routes/api/projects/+server.ts';
import { POST as postTopicRoute } from '../../routes/api/projects/[id]/topics/+server.ts';
import { POST as postNoteRoute } from '../../routes/api/topics/[id]/notes/+server.ts';
import { PATCH as patchTopicRoute } from '../../routes/api/topics/[id]/+server.ts';
import { GET as streamRoute } from '../../routes/api/topics/[id]/stream/+server.ts';
import { POST as postPairingRoute } from '../../routes/api/projects/[id]/pairings/+server.ts';

beforeEach(async () => {
	await resetDb();
	setVerifier(
		{
			createSessionCookie: async () => 'x',
			verifySessionCookie: async (cookie) => {
				if (!cookie.startsWith('cookie-')) throw new AuthRejected('bad');
				return { uid: cookie.slice(7), email: null, name: null };
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

async function json(res: Response | Promise<Response>) {
	const r = await res;
	return { status: r.status, body: await r.json() };
}

async function setup(topicPublic: boolean) {
	const { body: project } = await json(
		postProjectRoute(
			event({ method: 'POST', path: '/api/projects', body: { name: 'p' }, headers: as('alice') })
		)
	);
	const projectId = project.id as string;
	const { body: topic } = await json(
		postTopicRoute(
			event({
				method: 'POST',
				path: `/api/projects/${projectId}/topics`,
				body: { title: 'T', public: topicPublic },
				params: { id: projectId },
				headers: as('alice')
			})
		)
	);
	const { body: pairing } = await json(
		postPairingRoute(
			event({
				method: 'POST',
				path: `/api/projects/${projectId}/pairings`,
				params: { id: projectId },
				headers: as('alice')
			})
		)
	);
	const session = await api.redeem({ code: pairing.code });
	const owner = await json(
		postNoteRoute(
			event({
				method: 'POST',
				path: `/api/topics/${topic.topicId}/notes`,
				body: { anchor: { type: 'topic' }, intent: 'comment', text: 'mine' },
				params: { id: topic.topicId },
				headers: as('alice')
			})
		)
	);
	return {
		topicId: topic.topicId as string,
		noteId: owner.body.note.id as string,
		token: session.body.token as string
	};
}

describe('Session tokens', () => {
	const note = { anchor: { type: 'topic' }, intent: 'comment', text: 'hi' };

	it('cannot touch Notes of a private Topic of an owned Project', async () => {
		const { topicId, noteId, token } = await setup(false);
		expect((await api.addNote(topicId, note, token)).status).toBe(404);
		expect((await api.send(topicId, token)).status).toBe(404);
		expect((await api.patchNote(noteId, { text: 'x' }, token)).status).toBe(404);
		expect((await api.deleteNote(noteId, token)).status).toBe(404);
	});

	it('still write Notes into a public Topic', async () => {
		const { topicId, token } = await setup(true);
		expect((await api.addNote(topicId, note, token)).status).toBe(201);
	});
});

describe('write routes on a private Topic', () => {
	it('answer 404 to everyone but the owner, as the reads do', async () => {
		const { topicId } = await setup(false);
		const nodes = { nodes: [{ path: 'a', kind: 'fact', title: 'A' }] };
		for (const key of [undefined, 'bw_guess']) {
			expect((await api.putNodes(topicId, nodes, key)).status).toBe(404);
			expect((await api.deleteNodes(topicId, { paths: ['a'] }, key)).status).toBe(404);
			expect((await api.move(topicId, { path: 'a', parent: 'b' }, key)).status).toBe(404);
			expect((await api.resolve(topicId, {}, key)).status).toBe(404);
			expect((await api.pull(topicId, key)).status).toBe(404);
			expect((await api.wait(topicId, key)).status).toBe(404);
			expect((await api.patchTopic(topicId, { title: 'x' }, key)).status).toBe(404);
		}
	});
});

describe('flipping a Topic to private', () => {
	it('ends its open streams', async () => {
		const { topicId } = await setup(true);
		const stream = await streamRoute(
			event({ path: `/api/topics/${topicId}/stream`, params: { id: topicId } })
		);
		const reader = stream.body!.getReader();
		await reader.read();
		const flip = await patchTopicRoute(
			event({
				method: 'PATCH',
				path: `/api/topics/${topicId}`,
				body: { public: false },
				params: { id: topicId },
				headers: as('alice')
			})
		);
		expect(flip.status).toBe(200);
		let text = '';
		for (;;) {
			const { value, done } = await reader.read();
			if (value) text += new TextDecoder().decode(value);
			if (done) break;
		}
		expect(text).toContain('event: reset');
	});
});
