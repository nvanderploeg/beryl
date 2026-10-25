import { describe, expect, it } from 'vitest';
import demo from './demo-grill.json' with { type: 'json' };
import type { DemoFixture } from './types.ts';
import { DEMO_TOPIC_ID, foldHistory, foldTurns, turnStart } from './fold.ts';
import { applyEvent, nodeAt, type TopicState } from '#lib/ui/topic.ts';

const fixture = demo as DemoFixture;

function grill(turns: DemoFixture['turns']): DemoFixture {
	return { project: { name: 'P' }, topic: { title: 'T' }, turns };
}

describe('foldTurns over the demo grill', () => {
	it('is deterministic', () => {
		expect(foldTurns(fixture)).toEqual(foldTurns(fixture));
		expect(foldHistory(fixture, 3)).toEqual(foldHistory(fixture, 3));
	});

	it('starts with only the topic at turn 0', () => {
		const s = foldTurns(fixture, 0);
		expect(s.topic.title).toBe('Team workspaces');
		expect(s.topic.destination).toMatch(/^A spec for shared team workspaces/);
		expect(s.project.name).toBe('Tracker');
		expect(s.nodes).toEqual([]);
		expect(s.notes).toEqual([]);
		expect(s.lastSeq).toBe(1);
	});

	it('defaults to every turn', () => {
		expect(foldTurns(fixture)).toEqual(foldTurns(fixture, fixture.turns.length));
	});

	it('orders nodes by depth, position, path and notes by createdAt', () => {
		const s = foldTurns(fixture);
		const keys = s.nodes.map((n) => [n.depth, n.position, n.path] as const);
		const sorted = [...keys].sort(
			(a, b) => a[0] - b[0] || a[1] - b[1] || (a[2] < b[2] ? -1 : a[2] > b[2] ? 1 : 0)
		);
		expect(keys).toEqual(sorted);
		const created = s.notes.map((n) => n.createdAt);
		expect(created).toEqual([...created].sort());
	});

	it('gives siblings positions in creation order', () => {
		const s = foldTurns(fixture, 1);
		const top = s.nodes.filter((n) => n.depth === 1).map((n) => [n.path, n.position]);
		expect(top).toEqual([
			['tenancy', 0],
			['data', 1],
			['invites', 2],
			['permissions', 3],
			['migration', 4]
		]);
		const tenancy = s.nodes.filter((n) => n.parentPath === 'tenancy').map((n) => n.position);
		expect(tenancy).toEqual([0, 1, 2]);
	});

	it('defaults status by kind', () => {
		const s = foldTurns(fixture, 1);
		expect(nodeAt(s.nodes, 'tenancy/workspace')?.status).toBe('settled');
		expect(nodeAt(s.nodes, 'data/current')?.status).toBe('settled');
		expect(nodeAt(s.nodes, 'tenancy/model')?.status).toBe('open');
		expect(nodeAt(s.nodes, 'migration/existing')?.status).toBe('open');
		expect(nodeAt(s.nodes, 'tenancy')?.title).not.toBe('');
	});

	it('moves statusSince only when status changes', () => {
		const t1 = nodeAt(foldTurns(fixture, 1).nodes, 'tenancy/model')!;
		const t2 = nodeAt(foldTurns(fixture, 2).nodes, 'tenancy/model')!;
		expect(t2.status).toBe('settled');
		expect(t2.statusSince > t1.statusSince).toBe(true);
		const lock1 = nodeAt(foldTurns(fixture, 1).nodes, 'migration/lock')!;
		const lock3 = nodeAt(foldTurns(fixture, 3).nodes, 'migration/lock')!;
		expect(lock3.updatedAt > lock1.updatedAt).toBe(true);
		expect(lock3.statusSince).toBe(lock1.statusSince);
	});

	it('marks a parent stale when a child changes meaning', () => {
		expect(nodeAt(foldTurns(fixture, 1).nodes, 'tenancy')?.gistStale).toBe(false);
		expect(nodeAt(foldTurns(fixture, 2).nodes, 'tenancy')?.gistStale).toBe(true);
	});

	it('follows Current and clears it when the asked question settles', () => {
		expect(foldTurns(fixture, 1).topic.current).toBe('tenancy/model');
		expect(foldTurns(fixture, 2).topic.current).toBe('data/schema');
		expect(foldTurns(fixture, 5).topic.current).toBe('permissions/roles');
		const { events } = foldHistory(fixture, 2);
		const turn2 = events.filter((e) => e.type === 'topic' && e.at > turnStart(2));
		expect(turn2.map((e) => (e.payload as { current: string | null }).current)).toEqual([
			null,
			'data/schema'
		]);
	});

	it('removes nodes and keeps notes anchored to them', () => {
		const s = foldTurns(fixture, 3);
		expect(nodeAt(s.nodes, 'permissions/granularity')).toBeUndefined();
		expect(nodeAt(s.nodes, 'migration/existing')).toBeUndefined();
		expect(s.notes.some((n) => n.anchor.path === 'migration/existing')).toBe(true);
	});

	it('walks notes through queued, sent, delivered and resolved', () => {
		const t1 = foldTurns(fixture, 1).notes;
		expect(t1).toHaveLength(4);
		expect(t1.every((n) => n.status === 'queued' && n.sentAt !== null)).toBe(true);

		const t2 = foldTurns(fixture, 2).notes;
		expect(t2.slice(0, 4).every((n) => n.status === 'resolved' && n.deliveredAt !== null)).toBe(
			true
		);
		expect(t2[0].reply).toBe('Settled: row-level workspace_id.');
		expect(t2[0].changed).toEqual(['tenancy/model']);
		expect(t2.slice(4).every((n) => n.status === 'queued')).toBe(true);

		const t3 = foldTurns(fixture, 3).notes;
		expect(t3.slice(7).every((n) => n.status === 'queued' && n.sentAt === null)).toBe(true);

		const t5 = foldTurns(fixture, 5).notes;
		expect(t5.every((n) => n.status === 'resolved')).toBe(true);
	});

	it('keeps a note anchored to a widget element', () => {
		const pinned = foldTurns(fixture, 1).notes.find((n) => n.anchor.widget);
		expect(pinned?.anchor).toEqual({
			path: 'data/current',
			widget: 'current',
			element: 'labours.parent_id'
		});
		expect(pinned?.intent).toBe('comment');
		expect(pinned?.author).toBe('Sam');
	});

	it('stamps each turn after its start and before the next', () => {
		const { events } = foldHistory(fixture);
		for (const e of events.slice(1)) {
			expect(e.at > turnStart(0)).toBe(true);
			expect(e.at < turnStart(fixture.turns.length + 1)).toBe(true);
		}
		const turn3 = foldHistory(fixture, 3).events.filter((e) => e.at > turnStart(3));
		expect(turn3.length).toBeGreaterThan(0);
		expect(turn3.every((e) => e.at < turnStart(4))).toBe(true);
	});

	it('numbers events from 1 without gaps and replays to the snapshot', () => {
		const { snapshot, events } = foldHistory(fixture);
		expect(events.map((e) => e.seq)).toEqual(events.map((_, i) => i + 1));
		expect(snapshot.lastSeq).toBe(events.length);
		expect(events.every((e) => e.topicId === DEMO_TOPIC_ID)).toBe(true);
		let state: TopicState = {
			project: snapshot.project,
			topic: events[0].payload as TopicState['topic'],
			nodes: [],
			notes: [],
			lastSeq: 0
		};
		for (const e of events) state = applyEvent(state, e);
		expect(state.nodes).toEqual(snapshot.nodes);
		expect(state.notes).toEqual(snapshot.notes);
		expect(state.topic.current).toEqual(snapshot.topic.current);
		expect(state.lastSeq).toBe(snapshot.lastSeq);
	});

	it('emits one send event per Send with the stamped count', () => {
		const sends = foldHistory(fixture).events.filter((e) => e.type === 'send');
		expect(sends.map((e) => (e.payload as { count: number }).count)).toEqual([4, 3, 2]);
	});
});

describe('foldTurns write semantics', () => {
	it('creates missing ancestors as open areas titled by key, each with an event', () => {
		const { snapshot, events } = foldHistory(
			grill([{ nodes: [{ path: 'a/b/c', kind: 'decision', title: 'C' }] }])
		);
		expect(snapshot.nodes.map((n) => [n.path, n.kind, n.status, n.title])).toEqual([
			['a', 'area', 'open', 'a'],
			['a/b', 'area', 'open', 'b'],
			['a/b/c', 'decision', 'open', 'C']
		]);
		expect(events.filter((e) => e.type === 'node').map((e) => e.path)).toEqual([
			'a',
			'a/b',
			'a/b/c'
		]);
	});

	it('defaults title to key and requires kind on create', () => {
		expect(foldTurns(grill([{ nodes: [{ path: 'x', kind: 'fact' }] }])).nodes[0].title).toBe('x');
		expect(() => foldTurns(grill([{ nodes: [{ path: 'x' }] }]))).toThrow(
			'kind is required to create x'
		);
	});

	it('keeps omitted fields and replaces arrays on update', () => {
		const s = foldTurns(
			grill([
				{
					nodes: [
						{
							path: 'q',
							kind: 'decision',
							gist: 'g',
							rank: 2,
							edges: [
								{ rel: 'relates', to: 'a' },
								{ rel: 'relates', to: 'b' }
							]
						}
					]
				},
				{ nodes: [{ path: 'q', edges: [{ rel: 'conflicts', to: 'c' }], rank: null }] }
			])
		);
		expect(s.nodes[0].gist).toBe('g');
		expect(s.nodes[0].rank).toBeNull();
		expect(s.nodes[0].edges).toEqual([{ rel: 'conflicts', to: 'c' }]);
	});

	it('emits nothing for a write that changes nothing', () => {
		const once = foldHistory(grill([{ nodes: [{ path: 'q', kind: 'decision', gist: 'g' }] }]));
		const twice = foldHistory(
			grill([
				{ nodes: [{ path: 'q', kind: 'decision', gist: 'g' }] },
				{ nodes: [{ path: 'q', gist: 'g' }] }
			])
		);
		expect(twice.events.length).toBe(once.events.length);
	});

	it('clears a stale gist when the parent gist is rewritten, and never marks a leaf', () => {
		const s = foldTurns(
			grill([
				{
					nodes: [
						{ path: 'a', kind: 'area' },
						{ path: 'a/q', kind: 'decision' }
					]
				},
				{ nodes: [{ path: 'a/q', status: 'settled' }] }
			])
		);
		expect(nodeAt(s.nodes, 'a')?.gistStale).toBe(true);
		expect(nodeAt(s.nodes, 'a/q')?.gistStale).toBe(false);
		const rewritten = foldTurns(
			grill([
				{
					nodes: [
						{ path: 'a', kind: 'area' },
						{ path: 'a/q', kind: 'decision' }
					]
				},
				{
					nodes: [
						{ path: 'a/q', status: 'settled' },
						{ path: 'a', gist: 'all settled' }
					]
				}
			])
		);
		expect(nodeAt(rewritten.nodes, 'a')?.gistStale).toBe(false);
	});

	it('does not mark ancestors stale for a body-only change', () => {
		const s = foldTurns(
			grill([
				{
					nodes: [
						{ path: 'a/q', kind: 'decision' },
						{ path: 'a', kind: 'area', gist: 'g' }
					]
				},
				{ nodes: [{ path: 'a/q', body: 'more detail' }] }
			])
		);
		expect(nodeAt(s.nodes, 'a')?.gistStale).toBe(false);
	});

	it('removes a subtree deepest first and marks the remaining parent stale', () => {
		const { snapshot, events } = foldHistory(
			grill([
				{
					nodes: [
						{ path: 'a/b/c', kind: 'fact' },
						{ path: 'a/d', kind: 'fact' }
					]
				},
				{ remove: ['a/b'] }
			])
		);
		expect(snapshot.nodes.map((n) => n.path)).toEqual(['a', 'a/d']);
		expect(events.filter((e) => e.type === 'node_removed').map((e) => e.path)).toEqual([
			'a/b/c',
			'a/b'
		]);
		expect(nodeAt(snapshot.nodes, 'a')?.gistStale).toBe(true);
	});

	it('clears Current when its node is removed', () => {
		const s = foldTurns(
			grill([
				{ nodes: [{ path: 'q', kind: 'decision' }], topic: { current: 'q' } },
				{ remove: ['q'] }
			])
		);
		expect(s.topic.current).toBeNull();
	});

	it('moves a subtree with its edges, note anchors and Current', () => {
		const { snapshot, events } = foldHistory(
			grill([
				{
					nodes: [
						{ path: 'old/q', kind: 'decision' },
						{ path: 'old/q/sub', kind: 'fact' },
						{ path: 'other', kind: 'decision', edges: [{ rel: 'relies_on', to: 'old/q/sub' }] }
					],
					topic: { current: 'old/q' },
					notes: [{ anchor: { path: 'old/q/sub' }, intent: 'comment', text: 'hi' }]
				},
				{ move: [{ from: 'old/q', to: 'new/home/q' }] }
			])
		);
		expect(snapshot.nodes.map((n) => n.path).sort()).toEqual(
			['new', 'new/home', 'new/home/q', 'new/home/q/sub', 'old', 'other'].sort()
		);
		const moved = nodeAt(snapshot.nodes, 'new/home/q/sub')!;
		expect([moved.parentPath, moved.key, moved.depth]).toEqual(['new/home/q', 'sub', 4]);
		expect(nodeAt(snapshot.nodes, 'other')?.edges).toEqual([
			{ rel: 'relies_on', to: 'new/home/q/sub' }
		]);
		expect(snapshot.notes[0].anchor.path).toBe('new/home/q/sub');
		expect(snapshot.topic.current).toBe('new/home/q');
		const removed = events.filter((e) => e.type === 'node_removed').map((e) => e.path);
		expect(removed).toEqual(['old/q/sub', 'old/q']);
	});

	it('refuses a move into its own subtree or onto an existing path', () => {
		const base = {
			nodes: [
				{ path: 'a', kind: 'area' as const },
				{ path: 'b', kind: 'area' as const }
			]
		};
		expect(() => foldTurns(grill([base, { move: [{ from: 'a', to: 'a/x' }] }]))).toThrow();
		expect(() => foldTurns(grill([base, { move: [{ from: 'a', to: 'b' }] }]))).toThrow();
	});

	it('Send stamps only unsent queued notes and is silent with nothing to send', () => {
		const { snapshot, events } = foldHistory(
			grill([
				{
					nodes: [{ path: 'q', kind: 'decision' }],
					notes: [{ anchor: { path: 'q' }, intent: 'accept' }],
					send: true
				},
				{ send: true }
			])
		);
		expect(events.filter((e) => e.type === 'send')).toHaveLength(1);
		expect(snapshot.notes[0].text).toBe('');
		expect(snapshot.notes[0].sentAt).not.toBeNull();
	});

	it('sets closedAt when the topic closes', () => {
		const s = foldTurns(grill([{ topic: { status: 'closed', summary: 'done' } }]));
		expect(s.topic.status).toBe('closed');
		expect(s.topic.closedAt).not.toBeNull();
		expect(s.topic.summary).toBe('done');
	});
});
