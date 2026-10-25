import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '#lib/server/db/index.ts';
import { events, projects, topics } from '#lib/server/db/schema.ts';
import { subscribe } from '#lib/server/bus.ts';
import { resetDb } from '#lib/server/test/db.ts';
import {
	api,
	ORIGIN,
	seedProject,
	seedTopic,
	type Body,
	type Seeded
} from '#lib/server/test/http.ts';
import type { BerylEvent } from '#lib/types.ts';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const tick = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms));

async function eventsOf(topicId: string): Promise<Body[]> {
	const res = await api.events(topicId);
	expect(res.status).toBe(200);
	return res.body.events;
}

// Events appended after `seq`, as `type:path` (or `type` for path-less ones) for compact asserts.
async function eventsAfter(topicId: string, seq: number): Promise<string[]> {
	return (await eventsOf(topicId))
		.filter((e) => e.seq > seq)
		.map((e) => (e.path === null ? e.type : `${e.type}:${e.path}`));
}

async function lastSeq(topicId: string): Promise<number> {
	return (await api.getTopic(topicId)).body.lastSeq;
}

async function nodeMap(topicId: string): Promise<Map<string, Body>> {
	const res = await api.getTopic(topicId);
	return new Map(res.body.nodes.map((node: Body) => [node.path, node]));
}

let project: Seeded;

beforeEach(async () => {
	await resetDb();
	project = await seedProject();
});

describe('GET /api/health', () => {
	it('reports the service, version and a reachable database', async () => {
		const res = await api.health();
		expect(res.status).toBe(200);
		expect(res.headers.get('cache-control')).toBe('no-store');
		expect(res.body).toEqual({ service: 'beryl', version: expect.any(String), db: 'ok' });
	});
});

describe('POST /api/projects', () => {
	it('creates a project with a Write key and a Note key and a url on the request origin', async () => {
		const res = await api.createProject({ name: 'Tracker' });

		expect(res.status).toBe(201);
		expect(res.body).toEqual({
			id: expect.stringMatching(UUID_V4),
			name: 'Tracker',
			writeKey: expect.stringMatching(/^bw_[A-Za-z0-9_-]{43}$/),
			noteKey: expect.stringMatching(/^bn_[A-Za-z0-9_-]{43}$/),
			url: `${ORIGIN}/p/${res.body.id}`
		});
	});

	it('names the project Untitled when no name is given', async () => {
		const res = await api.createProject({});
		expect(res.body.name).toBe('Untitled');
	});

	it('stores only the sha256 of each key', async () => {
		const res = await api.createProject({ name: 'hashes' });
		const [row] = await db.select().from(projects).where(eq(projects.id, res.body.id));

		expect(row.writeKeyHash).toBe(sha256(res.body.writeKey));
		expect(row.noteKeyHash).toBe(sha256(res.body.noteKey));
		expect(JSON.stringify(row)).not.toContain(res.body.writeKey);
		expect(JSON.stringify(row)).not.toContain(res.body.noteKey);
	});

	it('mints fresh keys for every project', async () => {
		const other = await seedProject();
		expect(other.writeKey).not.toBe(project.writeKey);
		expect(other.noteKey).not.toBe(project.noteKey);
	});

	it.each([
		['an empty name', { name: '' }],
		['a non-string name', { name: 7 }],
		['a name over 200 characters', { name: 'x'.repeat(201) }]
	])('rejects %s with 400', async (_label, body) => {
		const res = await api.createProject(body);
		expect(res.status).toBe(400);
		expect(res.body.error).toMatch(/^name must be/);
	});

	it('rejects malformed JSON and non-object bodies', async () => {
		expect((await api.rawCreateProject('{nope')).body).toEqual({ error: 'malformed JSON body' });
		expect((await api.rawCreateProject('[1]')).body).toEqual({
			error: 'body must be a JSON object'
		});
	});
});

describe('GET and PATCH /api/projects/:id', () => {
	it('returns the project and its topic summaries, most recently updated first', async () => {
		const first = await seedTopic(project, { title: 'First' });
		await tick();
		const second = await seedTopic(project, { title: 'Second' });
		await tick();
		await api.putNodes(first.topicId, { nodes: [{ path: 'a', kind: 'fact' }] }, project.writeKey);

		const res = await api.getProject(project.id);

		expect(res.status).toBe(200);
		expect(res.body.project).toEqual({
			id: project.id,
			name: 'spec',
			createdAt: expect.stringMatching(ISO),
			lastWriteAt: expect.stringMatching(ISO)
		});
		expect(res.body.topics.map((t: Body) => t.id)).toEqual([first.topicId, second.topicId]);
	});

	it('computes counts and queued notes per topic on read', async () => {
		const { topicId } = await seedTopic(project, {
			nodes: [
				{ path: 'q1', kind: 'decision' },
				{ path: 'q2', kind: 'decision', status: 'settled' },
				{ path: 'area/as', kind: 'assumption' },
				{ path: 'area/fog', kind: 'fog' },
				{ path: 'area/risk', kind: 'risk' },
				{ path: 'area/risk2', kind: 'risk', status: 'parked' },
				{ path: 'f', kind: 'fact' },
				{ path: 't', kind: 'term', status: 'dropped' }
			]
		});
		await api.addNote(topicId, { anchor: { path: 'q1' }, intent: 'accept' }, project.noteKey);
		await api.addNote(
			topicId,
			{ anchor: { path: null }, intent: 'comment', text: 'hi' },
			project.noteKey
		);

		const [summary] = (await api.getProject(project.id)).body.topics;

		expect(summary.counts).toEqual({
			questions: 1,
			assumptions: 1,
			fog: 1,
			risks: 1,
			settled: 2,
			total: 8
		});
		expect(summary.queuedNotes).toBe(2);
		expect(summary).toMatchObject({ id: topicId, title: 'Spec topic', status: 'open' });
	});

	it('answers 404 for an unknown project and 400 for a malformed id', async () => {
		expect((await api.getProject(crypto.randomUUID())).status).toBe(404);
		expect((await api.getProject(crypto.randomUUID())).body).toEqual({
			error: 'project not found'
		});
		expect((await api.getProject('not-a-uuid')).status).toBe(400);
	});

	it('renames with the Write key only', async () => {
		const res = await api.patchProject(project.id, { name: 'Renamed' }, project.writeKey);
		expect(res.status).toBe(200);
		expect(res.body.project).toMatchObject({ id: project.id, name: 'Renamed' });

		expect((await api.patchProject(project.id, { name: 'x' })).status).toBe(401);
		expect((await api.patchProject(project.id, { name: 'x' }, project.noteKey)).status).toBe(403);
		expect((await api.patchProject(project.id, {}, project.writeKey)).status).toBe(400);
	});
});

describe('POST /api/projects/:id/topics', () => {
	it('creates the topic, then writes its nodes as one batch', async () => {
		const res = await api.createTopic(
			project.id,
			{
				title: 'Team workspaces',
				destination: 'A spec',
				summary: 'Teams want shared spaces.',
				agent: { tool: 'claude-code', model: 'opus', effort: 'high' },
				repo: 'owner/name',
				branch: 'main',
				nodes: [{ path: 'tenancy/model', kind: 'decision', title: 'Isolation model' }]
			},
			project.writeKey
		);

		expect(res.status).toBe(201);
		const { topicId } = res.body;
		expect(topicId).toMatch(UUID_V4);
		expect(res.body.url).toBe(`${ORIGIN}/p/${project.id}/t/${topicId}`);
		expect(res.body.topic).toEqual({
			id: topicId,
			projectId: project.id,
			title: 'Team workspaces',
			destination: 'A spec',
			summary: 'Teams want shared spaces.',
			status: 'open',
			current: null,
			agent: { tool: 'claude-code', model: 'opus', effort: 'high' },
			repo: 'owner/name',
			branch: 'main',
			createdAt: expect.stringMatching(ISO),
			updatedAt: expect.stringMatching(ISO),
			closedAt: null
		});
		expect(res.body.nodes.map((n: Body) => n.path)).toEqual(['tenancy/model']);
		expect(await eventsAfter(topicId, 0)).toEqual(['topic', 'node:tenancy', 'node:tenancy/model']);
	});

	it('defaults destination and summary to empty and agent, repo and branch to null', async () => {
		const { topic } = await seedTopic(project, { title: 'Bare' });
		expect(topic).toMatchObject({
			destination: '',
			summary: '',
			agent: null,
			repo: null,
			branch: null
		});
	});

	it('creates nothing when a node in the batch is invalid', async () => {
		const res = await api.createTopic(
			project.id,
			{ title: 'Broken', nodes: [{ path: 'ok', kind: 'fact' }, { path: 'missing-kind' }] },
			project.writeKey
		);

		expect(res.status).toBe(400);
		expect(res.body).toEqual({ error: 'kind is required to create missing-kind' });
		expect(await db.select().from(topics)).toEqual([]);
	});

	it('requires a title', async () => {
		const res = await api.createTopic(project.id, {}, project.writeKey);
		expect(res.body).toEqual({ error: 'title is required' });
	});
});

describe('GET /api/topics/:id', () => {
	it('returns the snapshot with nodes by depth, position, path and the last seq', async () => {
		const { topicId } = await seedTopic(project, {
			nodes: [
				{ path: 'b', kind: 'fact', position: 1 },
				{ path: 'a', kind: 'fact', position: 1 },
				{ path: 'c', kind: 'fact', position: 0 },
				{ path: 'c/x', kind: 'fact' }
			]
		});

		const res = await api.getTopic(topicId);

		expect(res.status).toBe(200);
		expect(res.body.project.id).toBe(project.id);
		expect(res.body.topic.id).toBe(topicId);
		expect(res.body.nodes.map((n: Body) => n.path)).toEqual(['c', 'a', 'b', 'c/x']);
		expect(res.body.notes).toEqual([]);
		const all = await eventsOf(topicId);
		expect(res.body.lastSeq).toBe(all[all.length - 1].seq);
	});

	it('answers 404 for an unknown topic and 400 for a malformed id', async () => {
		expect((await api.getTopic(crypto.randomUUID())).body).toEqual({ error: 'topic not found' });
		expect((await api.getTopic('nope')).status).toBe(400);
	});
});

describe('PATCH /api/topics/:id', () => {
	it('updates fields and emits one topic event', async () => {
		const { topicId } = await seedTopic(project);
		const seq = await lastSeq(topicId);

		const res = await api.patchTopic(
			topicId,
			{ title: 'New', destination: 'D', summary: 'S', agent: { model: 'm' } },
			project.writeKey
		);

		expect(res.status).toBe(200);
		expect(res.body.topic).toMatchObject({
			title: 'New',
			destination: 'D',
			summary: 'S',
			agent: { model: 'm' }
		});
		expect(await eventsAfter(topicId, seq)).toEqual(['topic']);
	});

	it('stamps closedAt when closed and clears it when reopened', async () => {
		const { topicId } = await seedTopic(project);

		const closed = await api.patchTopic(topicId, { status: 'closed' }, project.writeKey);
		expect(closed.body.topic.status).toBe('closed');
		expect(closed.body.topic.closedAt).toMatch(ISO);

		const reopened = await api.patchTopic(topicId, { status: 'open' }, project.writeKey);
		expect(reopened.body.topic).toMatchObject({ status: 'open', closedAt: null });
	});

	it('takes current only as null or the path of an open node', async () => {
		const { topicId } = await seedTopic(project, {
			nodes: [
				{ path: 'q', kind: 'decision' },
				{ path: 'done', kind: 'decision', status: 'settled' }
			]
		});

		expect(
			(await api.patchTopic(topicId, { current: 'q' }, project.writeKey)).body.topic.current
		).toBe('q');
		for (const current of ['done', 'missing']) {
			const res = await api.patchTopic(topicId, { current }, project.writeKey);
			expect(res.status).toBe(400);
			expect(res.body).toEqual({ error: 'current must be null or the path of an open node' });
		}
		expect((await api.patchTopic(topicId, { current: 'bad path' }, project.writeKey)).status).toBe(
			400
		);
		expect(
			(await api.patchTopic(topicId, { current: null }, project.writeKey)).body.topic.current
		).toBe(null);
	});

	it('emits nothing for a patch that changes nothing', async () => {
		const { topicId } = await seedTopic(project, { title: 'Same' });
		const seq = await lastSeq(topicId);

		const res = await api.patchTopic(topicId, { title: 'Same', current: null }, project.writeKey);

		expect(res.status).toBe(200);
		expect(await eventsAfter(topicId, seq)).toEqual([]);
	});
});

describe('PUT /api/topics/:id/nodes', () => {
	let topicId: string;
	const put = (nodes: unknown[]) => api.putNodes(topicId, { nodes }, project.writeKey);

	beforeEach(async () => {
		({ topicId } = await seedTopic(project));
	});

	it('requires kind to create a node', async () => {
		const res = await put([{ path: 'a/b', title: 'B' }]);
		expect(res.status).toBe(400);
		expect(res.body).toEqual({ error: 'kind is required to create a/b' });
	});

	it('creates missing ancestors first as open areas titled by key, each with its own event', async () => {
		const seq = await lastSeq(topicId);

		const res = await put([{ path: 'storage/engine/choice', kind: 'decision' }]);

		expect(res.status).toBe(200);
		expect(await eventsAfter(topicId, seq)).toEqual([
			'node:storage',
			'node:storage/engine',
			'node:storage/engine/choice'
		]);
		const nodes = await nodeMap(topicId);
		expect(nodes.get('storage')).toMatchObject({
			kind: 'area',
			status: 'open',
			title: 'storage',
			parentPath: null,
			depth: 1
		});
		expect(nodes.get('storage/engine')).toMatchObject({
			kind: 'area',
			parentPath: 'storage',
			key: 'engine',
			depth: 2
		});
	});

	it('fills defaults on create: title from key, status by kind, empty text, null rank', async () => {
		const res = await put([
			{ path: 'fact', kind: 'fact' },
			{ path: 'term', kind: 'term' },
			{ path: 'constraint', kind: 'constraint' },
			{ path: 'decision', kind: 'decision' },
			{ path: 'assumption', kind: 'assumption' },
			{ path: 'fog', kind: 'fog' },
			{ path: 'risk', kind: 'risk' },
			{ path: 'area', kind: 'area' }
		]);

		expect(res.body.nodes.map((n: Body) => [n.path, n.status])).toEqual([
			['fact', 'settled'],
			['term', 'settled'],
			['constraint', 'settled'],
			['decision', 'open'],
			['assumption', 'open'],
			['fog', 'open'],
			['risk', 'open'],
			['area', 'open']
		]);
		expect(res.body.nodes[3]).toEqual({
			topicId,
			path: 'decision',
			parentPath: null,
			key: 'decision',
			depth: 1,
			position: 3,
			kind: 'decision',
			status: 'open',
			title: 'decision',
			gist: '',
			body: '',
			recommendation: '',
			answer: '',
			rank: null,
			edges: [],
			widgets: [],
			sources: [],
			gistStale: false,
			createdAt: expect.stringMatching(ISO),
			updatedAt: expect.stringMatching(ISO),
			statusSince: expect.stringMatching(ISO)
		});
	});

	it('returns the written nodes in input order', async () => {
		const res = await put([
			{ path: 'z', kind: 'fact' },
			{ path: 'a', kind: 'fact' },
			{ path: 'z', gist: 'again' }
		]);
		expect(res.body.nodes.map((n: Body) => [n.path, n.gist])).toEqual([
			['z', 'again'],
			['a', ''],
			['z', 'again']
		]);
	});

	it('replaces given fields, keeps omitted ones and replaces arrays whole', async () => {
		await put([
			{
				path: 'q',
				kind: 'decision',
				title: 'Q',
				gist: 'g',
				body: 'b',
				recommendation: 'r',
				rank: 2,
				edges: [
					{ rel: 'relies_on', to: 'x' },
					{ rel: 'relates', to: 'y', label: 'see' }
				],
				sources: [{ url: 'https://example.com' }, { file: 'a.ts', line: 3 }],
				widgets: [{ key: 'm', type: 'markdown', data: { text: 'hi' } }]
			}
		]);

		const res = await put([
			{ path: 'q', answer: 'yes', edges: [{ rel: 'conflicts', to: 'z' }], sources: [], rank: null }
		]);

		expect(res.body.nodes[0]).toMatchObject({
			title: 'Q',
			gist: 'g',
			body: 'b',
			recommendation: 'r',
			answer: 'yes',
			rank: null,
			edges: [{ rel: 'conflicts', to: 'z' }],
			sources: [],
			widgets: [{ key: 'm', type: 'markdown', data: { text: 'hi' } }]
		});
	});

	it('appends among siblings when position is omitted on create and keeps it on update', async () => {
		await put([
			{ path: 'p/a', kind: 'fact' },
			{ path: 'p/b', kind: 'fact', position: 7 },
			{ path: 'p/c', kind: 'fact' },
			{ path: 'top', kind: 'fact' }
		]);
		await put([{ path: 'p/a', gist: 'moved nowhere' }]);
		const nodes = await nodeMap(topicId);

		expect(nodes.get('p')!.position).toBe(0);
		expect(nodes.get('top')!.position).toBe(1);
		expect(nodes.get('p/a')!.position).toBe(0);
		expect(nodes.get('p/b')!.position).toBe(7);
		expect(nodes.get('p/c')!.position).toBe(8);

		await put([{ path: 'p/a', position: 20 }]);
		expect((await nodeMap(topicId)).get('p/a')!.position).toBe(20);
	});

	it('moves statusSince only when status changes', async () => {
		const [created] = (await put([{ path: 'q', kind: 'decision' }])).body.nodes;
		await tick();
		const [edited] = (await put([{ path: 'q', gist: 'changed' }])).body.nodes;
		await tick();
		const [settled] = (await put([{ path: 'q', status: 'settled' }])).body.nodes;

		expect(edited.statusSince).toBe(created.statusSince);
		expect(edited.updatedAt > created.updatedAt).toBe(true);
		expect(settled.statusSince > created.statusSince).toBe(true);
	});

	it('emits no event and keeps updatedAt for a write that changes nothing', async () => {
		const [created] = (
			await put([
				{
					path: 'q',
					kind: 'decision',
					widgets: [{ key: 'w', type: 'table', data: { columns: ['a', 'b'], rows: [] } }]
				}
			])
		).body.nodes;
		const seq = await lastSeq(topicId);
		const topicBefore = (await api.getTopic(topicId)).body.topic.updatedAt;
		await tick();

		const res = await put([
			{
				path: 'q',
				kind: 'decision',
				status: 'open',
				widgets: [{ type: 'table', data: { rows: [], columns: ['a', 'b'] }, key: 'w' }]
			}
		]);

		expect(res.status).toBe(200);
		expect(res.body.nodes[0].updatedAt).toBe(created.updatedAt);
		expect(await eventsAfter(topicId, seq)).toEqual([]);
		expect((await api.getTopic(topicId)).body.topic.updatedAt).toBe(topicBefore);
	});

	it("bumps the topic's updatedAt and the project's lastWriteAt on a write", async () => {
		const before = (await api.getTopic(topicId)).body;
		await tick();

		await put([{ path: 'a', kind: 'fact' }]);

		const after = (await api.getTopic(topicId)).body;
		expect(after.topic.updatedAt > before.topic.updatedAt).toBe(true);
		expect(after.project.lastWriteAt > before.project.lastWriteAt).toBe(true);
	});

	it('publishes each stored event on the bus after the write commits', async () => {
		const seen: BerylEvent[] = [];
		const unsubscribe = subscribe(topicId, (e) => seen.push(e));
		try {
			await put([{ path: 'a/b', kind: 'fact' }]);
		} finally {
			unsubscribe();
		}
		const stored = (await eventsOf(topicId)).slice(-2);
		expect(seen).toEqual(stored);
		expect(seen.map((e) => e.type)).toEqual(['node', 'node']);
	});

	it('keeps paths case-sensitive', async () => {
		await put([
			{ path: 'Area', kind: 'fact' },
			{ path: 'area', kind: 'fact' }
		]);
		const nodes = await nodeMap(topicId);
		expect([...nodes.keys()].sort()).toEqual(['Area', 'area']);
	});

	describe('stale gists', () => {
		it('marks every ancestor of a created node stale, unless its title or gist was given', async () => {
			await put([
				{ path: 'a', kind: 'area', gist: 'A' },
				{ path: 'a/b', kind: 'area' },
				{ path: 'a/b/c', kind: 'fact' }
			]);
			let nodes = await nodeMap(topicId);
			expect(nodes.get('a')!.gistStale).toBe(false);
			expect(nodes.get('a/b')!.gistStale).toBe(true);
			expect(nodes.get('a/b/c')!.gistStale).toBe(false);

			await put([{ path: 'a/b/d', kind: 'fact' }]);
			nodes = await nodeMap(topicId);
			expect(nodes.get('a')!.gistStale).toBe(true);
			expect(nodes.get('a/b')!.gistStale).toBe(true);

			const res = await put([
				{ path: 'a', gist: 'A' },
				{ path: 'a/b', title: 'B' }
			]);
			expect(res.body.nodes.map((n: Body) => n.gistStale)).toEqual([false, false]);
		});

		it('marks ancestors when kind, status, title, gist, recommendation or answer changes', async () => {
			await put([
				{ path: 'p', kind: 'area', gist: 'P' },
				{ path: 'p/q', kind: 'decision' }
			]);
			const changes: Body[] = [
				{ kind: 'risk' },
				{ status: 'parked' },
				{ title: 'T' },
				{ gist: 'G' },
				{ recommendation: 'R' },
				{ answer: 'A' }
			];
			for (const change of changes) {
				await put([{ path: 'p', gist: 'P' }]);
				await put([{ path: 'p/q', ...change }]);
				expect((await nodeMap(topicId)).get('p')!.gistStale, JSON.stringify(change)).toBe(true);
			}
		});

		it('leaves ancestors alone when only body, rank, edges, widgets, sources or position change', async () => {
			await put([
				{ path: 'p', kind: 'area', gist: 'P' },
				{ path: 'p/q', kind: 'decision' }
			]);
			await put([
				{
					path: 'p/q',
					body: 'b',
					rank: 1,
					edges: [{ rel: 'relates', to: 'x' }],
					sources: [{ file: 'f' }],
					position: 5,
					widgets: [{ key: 'm', type: 'markdown', data: { text: 'x' } }]
				}
			]);
			expect((await nodeMap(topicId)).get('p')!.gistStale).toBe(false);
		});

		it('does not mark ancestors for a rewrite with the same values', async () => {
			await put([
				{ path: 'p', kind: 'area', gist: 'P' },
				{ path: 'p/q', kind: 'decision', title: 'Q' }
			]);
			await put([{ path: 'p/q', title: 'Q', kind: 'decision' }]);
			expect((await nodeMap(topicId)).get('p')!.gistStale).toBe(false);
		});

		it('clears a stale gist when the same title is written again', async () => {
			await put([
				{ path: 'p', kind: 'area', title: 'P' },
				{ path: 'p/q', kind: 'decision' }
			]);
			await put([{ path: 'p/r', kind: 'decision' }]);
			expect((await nodeMap(topicId)).get('p')!.gistStale).toBe(true);
			const seq = await lastSeq(topicId);

			await put([{ path: 'p', title: 'P' }]);

			expect((await nodeMap(topicId)).get('p')!.gistStale).toBe(false);
			expect(await eventsAfter(topicId, seq)).toEqual(['node:p']);
		});
	});

	describe('current', () => {
		it('clears current with one topic event when its node leaves open', async () => {
			await put([{ path: 'q', kind: 'decision' }]);
			await api.patchTopic(topicId, { current: 'q' }, project.writeKey);
			const seq = await lastSeq(topicId);

			await put([{ path: 'q', status: 'settled', answer: 'yes' }]);

			expect((await api.getTopic(topicId)).body.topic.current).toBeNull();
			const after = await eventsOf(topicId);
			expect(after.filter((e) => e.seq > seq).map((e) => e.type)).toEqual(['node', 'topic']);
			expect(after[after.length - 1].payload.current).toBeNull();
		});

		it('keeps current while its node stays open', async () => {
			await put([{ path: 'q', kind: 'decision' }]);
			await api.patchTopic(topicId, { current: 'q' }, project.writeKey);

			await put([{ path: 'q', gist: 'still open' }]);

			expect((await api.getTopic(topicId)).body.topic.current).toBe('q');
		});
	});

	describe('validation', () => {
		it('rejects an invalid widget with a message naming the widget, path and reason', async () => {
			const res = await put([
				{
					path: 'data/schema',
					kind: 'decision',
					widgets: [
						{
							key: 'tables',
							type: 'schema',
							data: {
								tables: [
									{ name: 'users', columns: [] },
									{ name: 'roles', columns: [{ name: 'id', type: 'int', nulable: true }] }
								]
							}
						}
					]
				}
			]);
			expect(res.status).toBe(400);
			expect(res.body).toEqual({
				error: 'widget tables on data/schema: tables[1].columns[0]: unknown field "nulable"'
			});
		});

		it('rejects duplicate widget keys on one node', async () => {
			const widget = { key: 'm', type: 'markdown', data: { text: '' } };
			const res = await put([{ path: 'a', kind: 'fact', widgets: [widget, widget] }]);
			expect(res.body).toEqual({ error: 'widget m on a: duplicate key' });
		});

		it('rejects an unknown widget type', async () => {
			const res = await put([
				{ path: 'a', kind: 'fact', widgets: [{ key: 'w', type: 'chart', data: {} }] }
			]);
			expect(res.body.error).toMatch(/^widget w on a: type: must be one of markdown, /);
		});

		it.each([
			['a character outside the segment set', 'bad key!', /^malformed nodes\[0\]\.path/],
			['an empty segment', 'ok//seg', /^malformed nodes\[0\]\.path/],
			['a segment longer than 64', 'x'.repeat(65), /^malformed nodes\[0\]\.path/],
			['depth over 8', 'a/b/c/d/e/f/g/h/i', /deeper than 8/],
			['a path over 512 characters', Array(8).fill('s'.repeat(64)).join('/'), /longer than 512/],
			['a non-string path', 7, /^nodes\[0\]\.path must be a string/]
		])('rejects %s', async (_label, path, message) => {
			const res = await put([{ path, kind: 'fact' }]);
			expect(res.status).toBe(400);
			expect(res.body.error).toMatch(message);
		});

		it('accepts a path at exactly 8 deep and 512 characters', async () => {
			const path = [...Array(7).fill('s'.repeat(64)), 's'.repeat(57)].join('/');
			expect(path.length).toBe(512);
			expect((await put([{ path, kind: 'fact' }])).status).toBe(200);
		});

		it.each([
			[
				'title over 120',
				{ title: 'x'.repeat(121) },
				'a: title must be a non-empty string of at most 120 characters'
			],
			[
				'empty title',
				{ title: '' },
				'a: title must be a non-empty string of at most 120 characters'
			],
			[
				'gist over 400',
				{ gist: 'x'.repeat(401) },
				'a: gist must be a string of at most 400 characters'
			],
			[
				'body over 20000',
				{ body: 'x'.repeat(20_001) },
				'a: body must be a string of at most 20000 characters'
			],
			[
				'recommendation over 2000',
				{ recommendation: 'x'.repeat(2001) },
				'a: recommendation must be a string of at most 2000 characters'
			],
			[
				'answer over 4000',
				{ answer: 'x'.repeat(4001) },
				'a: answer must be a string of at most 4000 characters'
			],
			[
				'an unknown kind',
				{ kind: 'question' },
				'a: kind must be one of area, decision, assumption, fact, term, fog, constraint, risk'
			],
			[
				'an unknown status',
				{ status: 'done' },
				'a: status must be one of open, settled, parked, dropped'
			],
			['a negative rank', { rank: -1 }, 'a: rank must be an integer of at least 0'],
			['a fractional position', { position: 1.5 }, 'a: position must be an integer'],
			['an unknown field', { recomendation: 'typo' }, 'a: unknown field "recomendation"'],
			[
				'too many edges',
				{ edges: Array(51).fill({ rel: 'relates', to: 'b' }) },
				'a: edges must be an array of at most 50'
			],
			[
				'an unknown edge rel',
				{ edges: [{ rel: 'blocks', to: 'b' }] },
				'a: edges[0].rel must be one of relies_on, relates, conflicts, supersedes'
			],
			[
				'a malformed edge target',
				{ edges: [{ rel: 'relates', to: 'b c' }] },
				/^malformed a: edges\[0\]\.to/
			],
			[
				'an edge label over 120',
				{ edges: [{ rel: 'relates', to: 'b', label: 'x'.repeat(121) }] },
				'a: edges[0].label must be a string of at most 120 characters'
			],
			[
				'an unknown edge field',
				{ edges: [{ rel: 'relates', to: 'b', weight: 1 }] },
				'a: edges[0]: unknown field "weight"'
			],
			[
				'too many sources',
				{ sources: Array(21).fill({ file: 'f' }) },
				'a: sources must be an array of at most 20'
			],
			[
				'a source without url or file',
				{ sources: [{ label: 'x' }] },
				'a: sources[0] needs a url or a file'
			],
			[
				'a non-http source url',
				{ sources: [{ url: 'ftp://x' }] },
				'a: sources[0].url must be http(s)'
			],
			[
				'a source line without file',
				{ sources: [{ url: 'https://x', line: 2 }] },
				'a: sources[0].line is allowed only with file'
			],
			[
				'a zero source line',
				{ sources: [{ file: 'f', line: 0 }] },
				'a: sources[0].line must be a positive integer'
			],
			[
				'too many widgets',
				{
					widgets: Array.from({ length: 13 }, (_, i) => ({
						key: `w${i}`,
						type: 'markdown',
						data: { text: '' }
					}))
				},
				'a: widgets must be an array of at most 12'
			]
		])('rejects %s', async (_label, fields, message) => {
			const res = await put([{ path: 'a', kind: 'fact', ...fields }]);
			expect(res.status).toBe(400);
			if (typeof message === 'string') expect(res.body.error).toBe(message);
			else expect(res.body.error).toMatch(message);
		});

		it('accepts dangling edges', async () => {
			const res = await put([
				{ path: 'a', kind: 'fact', edges: [{ rel: 'relies_on', to: 'nowhere/yet' }] }
			]);
			expect(res.status).toBe(200);
		});

		it('applies a batch all or nothing', async () => {
			const seq = await lastSeq(topicId);
			const res = await put([
				{ path: 'good', kind: 'fact' },
				{ path: 'bad', title: 'no kind' }
			]);
			expect(res.status).toBe(400);
			expect(await nodeMap(topicId)).toEqual(new Map());
			expect(await eventsAfter(topicId, seq)).toEqual([]);
		});

		it('caps a batch at 100 nodes', async () => {
			const nodes = Array.from({ length: 101 }, (_, i) => ({ path: `n${i}`, kind: 'fact' }));
			const res = await put(nodes);
			expect(res.body).toEqual({ error: 'nodes must be an array of at most 100 nodes' });
			expect((await put(nodes.slice(0, 100))).status).toBe(200);
		});

		it('caps a topic at 2000 nodes, counting created ancestors', async () => {
			for (let batch = 0; batch < 20; batch++) {
				const nodes = Array.from({ length: 100 }, (_, i) => ({
					path: `n${batch * 100 + i}`,
					kind: 'fact'
				}));
				expect((await put(nodes)).status).toBe(200);
			}
			expect((await put([{ path: 'n0', gist: 'update is fine' }])).status).toBe(200);
			const res = await put([{ path: 'one/more', kind: 'fact' }]);
			expect(res.body).toEqual({ error: 'a topic holds at most 2000 nodes' });
		}, 60_000);

		it('rejects a body without a nodes array', async () => {
			const res = await api.putNodes(topicId, {}, project.writeKey);
			expect(res.status).toBe(400);
		});
	});
});

describe('DELETE /api/topics/:id/nodes', () => {
	let topicId: string;

	beforeEach(async () => {
		({ topicId } = await seedTopic(project, {
			nodes: [
				{ path: 'a', kind: 'area', gist: 'A' },
				{ path: 'a/b', kind: 'decision' },
				{ path: 'a/b/c', kind: 'fact' },
				{ path: 'a/b/c/d', kind: 'fact' },
				{ path: 'a/e', kind: 'fact' },
				{ path: 'x', kind: 'fact', edges: [{ rel: 'relies_on', to: 'a/b/c' }] }
			]
		}));
		await api.putNodes(
			topicId,
			{
				nodes: [
					{ path: 'a', gist: 'A' },
					{ path: 'a/b', gist: 'B' }
				]
			},
			project.writeKey
		);
	});

	it('removes each path and its descendants, deepest first, one event each', async () => {
		const seq = await lastSeq(topicId);

		const res = await api.deleteNodes(topicId, { paths: ['a/b', 'missing'] }, project.writeKey);

		expect(res.status).toBe(200);
		expect(res.body).toEqual({ removed: ['a/b/c/d', 'a/b/c', 'a/b'] });
		const types = await eventsAfter(topicId, seq);
		expect(types.slice(0, 3)).toEqual([
			'node_removed:a/b/c/d',
			'node_removed:a/b/c',
			'node_removed:a/b'
		]);
		const removedPayloads = (await eventsOf(topicId)).filter((e) => e.type === 'node_removed');
		expect(removedPayloads.map((e) => e.payload)).toEqual([
			{ path: 'a/b/c/d' },
			{ path: 'a/b/c' },
			{ path: 'a/b' }
		]);
		expect([...(await nodeMap(topicId)).keys()].sort()).toEqual(['a', 'a/e', 'x']);
	});

	it('marks the remaining ancestors stale and keeps dangling edges and note anchors', async () => {
		const note = await api.addNote(
			topicId,
			{ anchor: { path: 'a/b/c' }, intent: 'comment', text: 'keep me' },
			project.noteKey
		);

		await api.deleteNodes(topicId, { paths: ['a/b'] }, project.writeKey);

		const nodes = await nodeMap(topicId);
		expect(nodes.get('a')!.gistStale).toBe(true);
		expect(nodes.get('x')!.edges).toEqual([{ rel: 'relies_on', to: 'a/b/c' }]);
		const [stored] = (await api.getTopic(topicId)).body.notes;
		expect(stored.id).toBe(note.body.note.id);
		expect(stored.anchor).toEqual({ path: 'a/b/c' });
	});

	it('never leaves a childless node stale', async () => {
		await api.deleteNodes(topicId, { paths: ['a/b/c/d'] }, project.writeKey);
		expect((await nodeMap(topicId)).get('a/b/c')!.gistStale).toBe(false);

		await api.putNodes(
			topicId,
			{ nodes: [{ path: 'solo/child', kind: 'fact' }] },
			project.writeKey
		);
		expect((await nodeMap(topicId)).get('solo')!.gistStale).toBe(true);
		await api.deleteNodes(topicId, { paths: ['solo/child'] }, project.writeKey);
		expect((await nodeMap(topicId)).get('solo')!.gistStale).toBe(false);
	});

	it('clears current when its node is removed', async () => {
		await api.patchTopic(topicId, { current: 'a/b' }, project.writeKey);
		const seq = await lastSeq(topicId);

		await api.deleteNodes(topicId, { paths: ['a'] }, project.writeKey);

		expect((await api.getTopic(topicId)).body.topic.current).toBeNull();
		expect((await eventsAfter(topicId, seq)).filter((t) => t === 'topic')).toHaveLength(1);
	});

	it('emits nothing when no path exists', async () => {
		const seq = await lastSeq(topicId);
		const res = await api.deleteNodes(topicId, { paths: ['nope'] }, project.writeKey);
		expect(res.body).toEqual({ removed: [] });
		expect(await eventsAfter(topicId, seq)).toEqual([]);
	});

	it('validates the paths', async () => {
		expect((await api.deleteNodes(topicId, { paths: 'a' }, project.writeKey)).status).toBe(400);
		expect((await api.deleteNodes(topicId, { paths: ['a b'] }, project.writeKey)).status).toBe(400);
	});
});

describe('POST /api/topics/:id/move', () => {
	let topicId: string;

	beforeEach(async () => {
		({ topicId } = await seedTopic(project, {
			nodes: [
				{ path: 'old', kind: 'area', gist: 'O' },
				{
					path: 'old/q',
					kind: 'decision',
					gist: 'Q',
					edges: [{ rel: 'relates', to: 'old/q/sub' }]
				},
				{ path: 'old/q/sub', kind: 'fact' },
				{ path: 'old/keep', kind: 'fact' },
				{ path: 'dest', kind: 'area', gist: 'D' },
				{ path: 'dest/other', kind: 'fact' },
				{
					path: 'watcher',
					kind: 'fact',
					edges: [
						{ rel: 'relies_on', to: 'old/q' },
						{ rel: 'relates', to: 'old/keep' }
					]
				}
			]
		}));
		await api.putNodes(
			topicId,
			{
				nodes: [
					{ path: 'old', gist: 'O' },
					{ path: 'dest', gist: 'D' },
					{ path: 'old/q', gist: 'Q' }
				]
			},
			project.writeKey
		);
	});

	it('re-paths the subtree and makes edges, note anchors and current follow', async () => {
		await api.patchTopic(topicId, { current: 'old/q' }, project.writeKey);
		const note = (
			await api.addNote(
				topicId,
				{ anchor: { path: 'old/q/sub', widget: 'w', element: 'e' }, intent: 'comment', text: 'n' },
				project.noteKey
			)
		).body.note;
		const before = await nodeMap(topicId);
		const seq = await lastSeq(topicId);

		const res = await api.move(topicId, { from: 'old/q', to: 'dest/q2' }, project.writeKey);

		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			moved: [
				{ from: 'old/q', to: 'dest/q2' },
				{ from: 'old/q/sub', to: 'dest/q2/sub' }
			]
		});
		const nodes = await nodeMap(topicId);
		expect(nodes.has('old/q')).toBe(false);
		expect(nodes.get('dest/q2')).toMatchObject({
			parentPath: 'dest',
			key: 'q2',
			depth: 2,
			position: 1,
			gist: 'Q',
			createdAt: before.get('old/q')!.createdAt,
			edges: [{ rel: 'relates', to: 'dest/q2/sub' }]
		});
		expect(nodes.get('dest/q2/sub')).toMatchObject({ parentPath: 'dest/q2', key: 'sub', depth: 3 });
		expect(nodes.get('watcher')!.edges).toEqual([
			{ rel: 'relies_on', to: 'dest/q2' },
			{ rel: 'relates', to: 'old/keep' }
		]);
		const snapshot = (await api.getTopic(topicId)).body;
		expect(snapshot.topic.current).toBe('dest/q2');
		expect(snapshot.notes[0]).toMatchObject({
			id: note.id,
			anchor: { path: 'dest/q2/sub', widget: 'w', element: 'e' }
		});

		expect(await eventsAfter(topicId, seq)).toEqual([
			'node_removed:old/q/sub',
			'node_removed:old/q',
			'node:dest/q2',
			'node:dest/q2/sub',
			'node:watcher',
			'node:old',
			'node:dest',
			'note',
			'topic'
		]);
	});

	it('marks ancestors of both from and to stale', async () => {
		await api.move(topicId, { from: 'old/q', to: 'dest/q2' }, project.writeKey);
		const nodes = await nodeMap(topicId);
		expect(nodes.get('old')!.gistStale).toBe(true);
		expect(nodes.get('dest')!.gistStale).toBe(true);
		expect(nodes.get('dest/q2')!.gistStale).toBe(false);
	});

	it('creates missing ancestors of to as areas', async () => {
		await api.move(topicId, { from: 'old/keep', to: 'fresh/deeper/keep' }, project.writeKey);
		const nodes = await nodeMap(topicId);
		expect(nodes.get('fresh')).toMatchObject({ kind: 'area', status: 'open', title: 'fresh' });
		expect(nodes.get('fresh/deeper')).toMatchObject({ kind: 'area', parentPath: 'fresh' });
		expect(nodes.get('fresh/deeper/keep')).toMatchObject({ kind: 'fact', position: 0 });
	});

	it('keeps the position when renaming under the same parent', async () => {
		const before = (await nodeMap(topicId)).get('old/keep')!;
		await api.move(topicId, { from: 'old/keep', to: 'old/kept' }, project.writeKey);
		expect((await nodeMap(topicId)).get('old/kept')!.position).toBe(before.position);
	});

	it.each([
		['to exists', { from: 'old/q', to: 'dest/other' }, 'node dest/other already exists'],
		['to inside from', { from: 'old', to: 'old/q/sub/x' }, 'cannot move old inside itself'],
		['to equal to from', { from: 'old', to: 'old' }, 'cannot move old inside itself'],
		['from missing', { from: 'ghost', to: 'dest/ghost' }, 'no node ghost'],
		[
			'too deep a result',
			{ from: 'old', to: 'a/b/c/d/e/f/g' },
			'moving old to a/b/c/d/e/f/g puts a/b/c/d/e/f/g/q/sub deeper than 8'
		]
	])('rejects a move when %s', async (_label, body, error) => {
		const res = await api.move(topicId, body, project.writeKey);
		expect(res.status).toBe(400);
		expect(res.body).toEqual({ error });
	});
});

describe('GET /api/topics/:id/events', () => {
	it('lists events in seq order with full-row payloads and filters by path', async () => {
		const { topicId } = await seedTopic(project, { nodes: [{ path: 'a/b', kind: 'fact' }] });
		await api.putNodes(topicId, { nodes: [{ path: 'a/b', gist: 'x' }] }, project.writeKey);

		const all = await eventsOf(topicId);
		expect(all.map((e) => e.seq)).toEqual([...all.map((e) => e.seq)].sort((x, y) => x - y));
		expect(all[0]).toEqual({
			seq: expect.any(Number),
			type: 'topic',
			topicId,
			path: null,
			payload: expect.objectContaining({ id: topicId, title: 'Spec topic' }),
			at: expect.stringMatching(ISO)
		});

		const filtered = (await api.events(topicId, 'a/b')).body.events;
		expect(filtered.map((e: Body) => [e.type, e.path])).toEqual([
			['node', 'a/b'],
			['node', 'a/b']
		]);
		expect(filtered[1].payload).toMatchObject({ path: 'a/b', gist: 'x', topicId });
	});

	it('answers 404 for an unknown topic and 400 for a malformed path', async () => {
		const { topicId } = await seedTopic(project);
		expect((await api.events(crypto.randomUUID())).status).toBe(404);
		expect((await api.events(topicId, 'a b')).status).toBe(400);
	});
});

describe('notes', () => {
	let topicId: string;
	const add = (body: Body, key = project.noteKey) => api.addNote(topicId, body, key);

	beforeEach(async () => {
		({ topicId } = await seedTopic(project, {
			nodes: [
				{ path: 'q', kind: 'decision', title: 'Question' },
				{ path: 'area/as', kind: 'assumption', title: 'Assume' }
			]
		}));
	});

	describe('POST /api/topics/:id/notes', () => {
		it('creates a queued note with the Note key', async () => {
			const seq = await lastSeq(topicId);
			const res = await add({
				anchor: { path: 'q', widget: 'choices', element: 'row.isolation' },
				intent: 'answer',
				text: 'Row level',
				author: 'norman'
			});

			expect(res.status).toBe(201);
			expect(res.body.note).toEqual({
				id: expect.stringMatching(UUID_V4),
				topicId,
				anchor: { path: 'q', widget: 'choices', element: 'row.isolation' },
				intent: 'answer',
				text: 'Row level',
				author: 'norman',
				status: 'queued',
				sentAt: null,
				deliveredAt: null,
				resolvedAt: null,
				reply: '',
				changed: [],
				createdAt: expect.stringMatching(ISO),
				updatedAt: expect.stringMatching(ISO)
			});
			const after = (await eventsOf(topicId)).filter((e) => e.seq > seq);
			expect(after.map((e) => [e.type, e.path])).toEqual([['note', null]]);
			expect(after[0].payload).toEqual(res.body.note);
		});

		it('pins a note to the topic as a whole with a null path', async () => {
			const res = await add({ anchor: { path: null }, intent: 'comment', text: 'overall' });
			expect(res.status).toBe(201);
			expect(res.body.note.anchor).toEqual({ path: null });
		});

		it('rejects an anchor on a missing node', async () => {
			const res = await add({ anchor: { path: 'missing' }, intent: 'accept' });
			expect(res.status).toBe(400);
			expect(res.body).toEqual({ error: 'no node missing' });
		});

		it('requires text for answer, correct, comment and explore', async () => {
			for (const intent of ['answer', 'correct', 'comment', 'explore']) {
				const res = await add({ anchor: { path: 'q' }, intent });
				expect(res.body).toEqual({ error: `text is required for ${intent}` });
			}
			for (const intent of ['accept', 'defer', 'drop']) {
				expect((await add({ anchor: { path: 'q' }, intent })).status).toBe(201);
			}
		});

		it.each([
			['no anchor', { intent: 'accept' }, 'anchor is required'],
			['no intent', { anchor: { path: 'q' } }, 'intent is required'],
			['an unknown intent', { anchor: { path: 'q' }, intent: 'ask' }, /^intent must be one of/],
			[
				'text over 4000',
				{ anchor: { path: 'q' }, intent: 'comment', text: 'x'.repeat(4001) },
				/^text must be/
			],
			[
				'author over 64',
				{ anchor: { path: 'q' }, intent: 'accept', author: 'x'.repeat(65) },
				/^author must be/
			],
			[
				'a widget without a path',
				{ anchor: { path: null, widget: 'w' }, intent: 'accept' },
				'anchor.widget needs anchor.path'
			],
			[
				'an element without a widget',
				{ anchor: { path: 'q', element: 'e' }, intent: 'accept' },
				'anchor.element needs anchor.widget'
			],
			[
				'an element over 200',
				{ anchor: { path: 'q', widget: 'w', element: 'x'.repeat(201) }, intent: 'accept' },
				/^anchor\.element must be/
			],
			[
				'a malformed anchor path',
				{ anchor: { path: 'a b' }, intent: 'accept' },
				/^malformed anchor\.path/
			]
		])('rejects %s', async (_label, body, error) => {
			const res = await add(body as Body);
			expect(res.status).toBe(400);
			if (typeof error === 'string') expect(res.body).toEqual({ error });
			else expect(res.body.error).toMatch(error);
		});
	});

	describe('PATCH and DELETE /api/notes/:noteId', () => {
		it('edits and deletes a queued note', async () => {
			const { note } = (await add({ anchor: { path: 'q' }, intent: 'accept' })).body;

			const edited = await api.patchNote(
				note.id,
				{ intent: 'answer', text: 'Use rows' },
				project.noteKey
			);
			expect(edited.status).toBe(200);
			expect(edited.body.note).toMatchObject({ id: note.id, intent: 'answer', text: 'Use rows' });

			const seq = await lastSeq(topicId);
			const removed = await api.deleteNote(note.id, project.noteKey);
			expect(removed.body).toEqual({ removed: note.id });
			const after = (await eventsOf(topicId)).filter((e) => e.seq > seq);
			expect(after.map((e) => [e.type, e.payload])).toEqual([['note_removed', { id: note.id }]]);
			expect((await api.getTopic(topicId)).body.notes).toEqual([]);
		});

		it('keeps the text requirement on edit', async () => {
			const { note } = (await add({ anchor: { path: 'q' }, intent: 'accept' })).body;
			const res = await api.patchNote(note.id, { intent: 'comment' }, project.noteKey);
			expect(res.body).toEqual({ error: 'text is required for comment' });
		});

		it('refuses to edit or delete a note once delivered', async () => {
			const { note } = (await add({ anchor: { path: 'q' }, intent: 'accept' })).body;
			await api.pull(topicId, project.writeKey);

			const edit = await api.patchNote(note.id, { text: 'late' }, project.noteKey);
			expect(edit.status).toBe(409);
			expect(edit.body).toEqual({ error: 'note already delivered' });
			const remove = await api.deleteNote(note.id, project.noteKey);
			expect(remove.status).toBe(409);
		});

		it('answers 404 for an unknown note', async () => {
			const res = await api.patchNote(crypto.randomUUID(), { text: 'x' }, project.noteKey);
			expect(res.body).toEqual({ error: 'note not found' });
		});
	});

	describe('POST /api/topics/:id/send', () => {
		it('stamps sentAt on queued unsent notes, one note event each, then one send event', async () => {
			const a = (await add({ anchor: { path: 'q' }, intent: 'accept' })).body.note;
			const b = (await add({ anchor: { path: null }, intent: 'comment', text: 'b' })).body.note;
			const seq = await lastSeq(topicId);

			const res = await api.send(topicId, project.noteKey);

			expect(res.body).toEqual({ sent: 2 });
			const after = (await eventsOf(topicId)).filter((e) => e.seq > seq);
			expect(after.map((e) => e.type)).toEqual(['note', 'note', 'send']);
			expect(
				after
					.slice(0, 2)
					.map((e) => e.payload.id)
					.sort()
			).toEqual([a.id, b.id].sort());
			expect(after[0].payload.sentAt).toMatch(ISO);
			expect(after[2].payload).toEqual({ count: 2, at: after[0].payload.sentAt });
		});

		it('emits nothing and answers sent 0 when nothing is left to stamp', async () => {
			await add({ anchor: { path: 'q' }, intent: 'accept' });
			await api.send(topicId, project.noteKey);
			const seq = await lastSeq(topicId);

			expect((await api.send(topicId, project.noteKey)).body).toEqual({ sent: 0 });
			expect(await eventsAfter(topicId, seq)).toEqual([]);
		});

		it('stamps only notes added since the last send', async () => {
			await add({ anchor: { path: 'q' }, intent: 'accept' });
			await api.send(topicId, project.noteKey);
			await add({ anchor: { path: 'q' }, intent: 'defer' });
			expect((await api.send(topicId, project.noteKey)).body).toEqual({ sent: 1 });
		});
	});

	describe('POST /api/topics/:id/pull', () => {
		it('delivers every queued note, sent or not, and returns unresolved, context and stale', async () => {
			const first = (await add({ anchor: { path: 'q' }, intent: 'accept' })).body.note;
			await api.pull(topicId, project.writeKey);
			await tick();
			const sent = (await add({ anchor: { path: 'area/as' }, intent: 'correct', text: 'No' })).body
				.note;
			await api.send(topicId, project.noteKey);
			await tick();
			const unsent = (await add({ anchor: { path: null }, intent: 'comment', text: 'c' })).body
				.note;
			await api.putNodes(
				topicId,
				{ nodes: [{ path: 'area/new', kind: 'fact' }] },
				project.writeKey
			);
			const seq = await lastSeq(topicId);

			const res = await api.pull(topicId, project.writeKey);

			expect(res.status).toBe(200);
			expect(res.body.notes.map((n: Body) => n.id)).toEqual([sent.id, unsent.id]);
			for (const note of res.body.notes) {
				expect(note.status).toBe('delivered');
				expect(note.deliveredAt).toMatch(ISO);
			}
			expect(res.body.notes[0].sentAt).toMatch(ISO);
			expect(res.body.notes[1].sentAt).toBeNull();
			expect(res.body.unresolved.map((n: Body) => n.id)).toEqual([first.id]);
			expect(res.body.context).toEqual({
				q: { title: 'Question', kind: 'decision', status: 'open' },
				'area/as': { title: 'Assume', kind: 'assumption', status: 'open' }
			});
			expect(res.body.stale).toEqual([{ path: 'area', title: 'area' }]);
			expect(await eventsAfter(topicId, seq)).toEqual(['note', 'note']);
		});

		it('emits nothing when nothing is queued', async () => {
			const seq = await lastSeq(topicId);
			const res = await api.pull(topicId, project.writeKey);
			expect(res.body).toMatchObject({ notes: [], unresolved: [], context: {} });
			expect(await eventsAfter(topicId, seq)).toEqual([]);
		});
	});

	describe('POST /api/topics/:id/resolve', () => {
		it('resolves notes in any status and replaces reply and changed on a second resolve', async () => {
			const queued = (await add({ anchor: { path: 'q' }, intent: 'accept' })).body.note;
			const res = await api.resolve(
				topicId,
				{ notes: [{ id: queued.id, reply: 'Took it', changed: ['q'] }] },
				project.writeKey
			);

			expect(res.status).toBe(200);
			expect(res.body.notes[0]).toMatchObject({
				id: queued.id,
				status: 'resolved',
				reply: 'Took it',
				changed: ['q'],
				resolvedAt: expect.stringMatching(ISO)
			});

			const again = await api.resolve(
				topicId,
				{ notes: [{ id: queued.id, reply: 'Revised', changed: ['q', 'area/as'] }] },
				project.writeKey
			);
			expect(again.body.notes[0]).toMatchObject({
				reply: 'Revised',
				changed: ['q', 'area/as'],
				resolvedAt: res.body.notes[0].resolvedAt
			});
			expect((await api.pull(topicId, project.writeKey)).body.unresolved).toEqual([]);
		});

		it('emits nothing for a repeat resolve with the same reply and changed', async () => {
			const note = (await add({ anchor: { path: 'q' }, intent: 'accept' })).body.note;
			const body = { notes: [{ id: note.id, reply: 'r', changed: ['q'] }] };
			await api.resolve(topicId, body, project.writeKey);
			const seq = await lastSeq(topicId);
			await api.resolve(topicId, body, project.writeKey);
			expect(await eventsAfter(topicId, seq)).toEqual([]);
		});

		it('answers 404 for a note outside the topic and validates the body', async () => {
			const other = await seedTopic(project, { nodes: [{ path: 'q', kind: 'decision' }] });
			const foreign = (
				await api.addNote(
					other.topicId,
					{ anchor: { path: 'q' }, intent: 'accept' },
					project.noteKey
				)
			).body.note;

			const res = await api.resolve(topicId, { notes: [{ id: foreign.id }] }, project.writeKey);
			expect(res.status).toBe(404);
			expect(res.body).toEqual({ error: 'note not found' });
			expect((await api.resolve(topicId, { notes: [{ id: 'x' }] }, project.writeKey)).status).toBe(
				400
			);
			expect(
				(
					await api.resolve(
						topicId,
						{ notes: [{ id: foreign.id, changed: ['a b'] }] },
						project.writeKey
					)
				).status
			).toBe(400);
			expect(
				(
					await api.resolve(
						topicId,
						{ notes: [{ id: foreign.id, reply: 'x'.repeat(2001) }] },
						project.writeKey
					)
				).status
			).toBe(400);
		});
	});
});

describe('auth', () => {
	let topicId: string;
	let noteId: string;
	let other: Seeded;

	beforeEach(async () => {
		({ topicId } = await seedTopic(project, { nodes: [{ path: 'q', kind: 'decision' }] }));
		noteId = (
			await api.addNote(topicId, { anchor: { path: 'q' }, intent: 'accept' }, project.noteKey)
		).body.note.id;
		other = await seedProject('other');
	});

	const writeRoutes: [string, (key?: string) => Promise<{ status: number; body: Body }>][] = [
		['PATCH project', (key) => api.patchProject(project.id, { name: 'x' }, key)],
		['POST topics', (key) => api.createTopic(project.id, { title: 't' }, key)],
		['PATCH topic', (key) => api.patchTopic(topicId, { title: 't' }, key)],
		['PUT nodes', (key) => api.putNodes(topicId, { nodes: [] }, key)],
		['DELETE nodes', (key) => api.deleteNodes(topicId, { paths: [] }, key)],
		['POST move', (key) => api.move(topicId, { from: 'q', to: 'r' }, key)],
		['POST pull', (key) => api.pull(topicId, key)],
		['POST resolve', (key) => api.resolve(topicId, { notes: [] }, key)],
		['GET wait', (key) => api.wait(topicId, key, '?timeoutMs=1000')]
	];

	const noteRoutes: [string, (key?: string) => Promise<{ status: number; body: Body }>][] = [
		[
			'POST notes',
			(key) => api.addNote(topicId, { anchor: { path: null }, intent: 'accept' }, key)
		],
		['PATCH note', (key) => api.patchNote(noteId, { intent: 'defer' }, key)],
		['DELETE note', (key) => api.deleteNote(noteId, key)],
		['POST send', (key) => api.send(topicId, key)]
	];

	it.each(writeRoutes)('%s needs the Write key', async (_label, call) => {
		expect(await call()).toMatchObject({ status: 401, body: { error: 'missing key' } });
		expect(await call(project.noteKey)).toMatchObject({
			status: 403,
			body: { error: 'invalid key' }
		});
		expect(await call('bw_garbage')).toMatchObject({ status: 403, body: { error: 'invalid key' } });
		expect((await call(other.writeKey)).status).toBe(403);
	});

	it.each(noteRoutes)('%s needs the Note key', async (_label, call) => {
		expect(await call()).toMatchObject({ status: 401, body: { error: 'missing key' } });
		expect(await call(project.writeKey)).toMatchObject({
			status: 403,
			body: { error: 'invalid key' }
		});
		expect((await call(other.noteKey)).status).toBe(403);
		expect((await call(project.noteKey)).status).toBeLessThan(300);
	});

	it('answers 404 for unknown targets before checking keys', async () => {
		const missing = crypto.randomUUID();
		expect((await api.putNodes(missing, { nodes: [] })).body).toEqual({ error: 'topic not found' });
		expect((await api.patchProject(missing, { name: 'x' })).body).toEqual({
			error: 'project not found'
		});
		expect((await api.deleteNote(missing)).body).toEqual({ error: 'note not found' });
	});

	it('answers 400 for malformed ids', async () => {
		expect((await api.putNodes('bad', { nodes: [] }, project.writeKey)).body).toEqual({
			error: 'malformed topic id'
		});
		expect((await api.deleteNote('bad', project.noteKey)).body).toEqual({
			error: 'malformed note id'
		});
	});

	it('leaves reads open without a key', async () => {
		expect((await api.getProject(project.id)).status).toBe(200);
		expect((await api.getTopic(topicId)).status).toBe(200);
		expect((await api.events(topicId)).status).toBe(200);
	});
});

describe('events table', () => {
	it('stores one row per changed row with the full payload', async () => {
		const { topicId } = await seedTopic(project, { nodes: [{ path: 'a', kind: 'fact' }] });
		const rows = await db.select().from(events).where(eq(events.topicId, topicId));
		expect(rows.map((r) => r.type)).toEqual(['topic', 'node']);
		expect(rows[1].payload).toMatchObject({ path: 'a', kind: 'fact', status: 'settled' });
	});
});
