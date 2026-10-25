import { describe, expect, it } from 'vitest';
import type { Node, Note, SpeculumEvent, Project, Topic } from '../types.ts';
import {
	LOD_MID,
	LOD_NEAR,
	ancestorsOf,
	applyEvent,
	childrenOf,
	countsOf,
	defaultIntent,
	descendantsOf,
	freshSince,
	frontier,
	incomingEdges,
	isUnknown,
	lodFor,
	marksOf,
	nodeAt,
	notesOn,
	pendingAnswer,
	progressOf,
	questionList,
	queuedCount,
	type TopicState
} from './topic.ts';

const T0 = '2026-01-01T00:00:00.000Z';
const at = (minute: number) => new Date(Date.parse(T0) + minute * 60_000).toISOString();

function node(path: string, over: Partial<Node> = {}): Node {
	const parts = path.split('/');
	return {
		topicId: 't',
		path,
		parentPath: parts.length > 1 ? parts.slice(0, -1).join('/') : null,
		key: parts.at(-1)!,
		depth: parts.length,
		position: 0,
		kind: 'decision',
		status: 'open',
		title: parts.at(-1)!,
		gist: '',
		body: '',
		recommendation: '',
		answer: '',
		rank: null,
		edges: [],
		widgets: [],
		sources: [],
		gistStale: false,
		createdAt: T0,
		updatedAt: T0,
		statusSince: T0,
		...over
	};
}

function note(id: string, over: Partial<Note> = {}): Note {
	return {
		id,
		topicId: 't',
		anchor: { path: null },
		intent: 'comment',
		text: 'x',
		author: '',
		status: 'queued',
		sentAt: null,
		deliveredAt: null,
		resolvedAt: null,
		reply: '',
		changed: [],
		createdAt: T0,
		updatedAt: T0,
		...over
	};
}

const project: Project = { id: 'p', name: 'P', createdAt: T0, lastWriteAt: T0 };
const topic: Topic = {
	id: 't',
	projectId: 'p',
	title: 'T',
	destination: '',
	summary: '',
	status: 'open',
	current: null,
	agent: null,
	repo: null,
	branch: null,
	createdAt: T0,
	updatedAt: T0,
	closedAt: null
};

function event(seq: number, type: SpeculumEvent['type'], payload: SpeculumEvent['payload']) {
	return { seq, type, topicId: 't', path: null, payload, at: T0 } satisfies SpeculumEvent;
}

describe('applyEvent', () => {
	const base: TopicState = {
		project,
		topic,
		nodes: [node('a', { kind: 'area' }), node('a/x')],
		notes: [note('n1')],
		lastSeq: 5
	};

	it('returns the same reference for a seq at or below lastSeq', () => {
		expect(applyEvent(base, event(5, 'topic', { ...topic, title: 'New' }))).toBe(base);
		expect(applyEvent(base, event(2, 'node', node('b')))).toBe(base);
	});

	it('replaces the topic and advances lastSeq without mutating the input', () => {
		const next = applyEvent(base, event(6, 'topic', { ...topic, title: 'New' }));
		expect(next).not.toBe(base);
		expect(next.topic.title).toBe('New');
		expect(next.lastSeq).toBe(6);
		expect(base.topic.title).toBe('T');
		expect(base.lastSeq).toBe(5);
	});

	it('upserts nodes by path and keeps them in depth, position, path order', () => {
		const inserted = applyEvent(base, event(6, 'node', node('b', { position: 1 })));
		expect(inserted.nodes.map((n) => n.path)).toEqual(['a', 'b', 'a/x']);
		const updated = applyEvent(inserted, event(7, 'node', node('a/x', { title: 'Renamed' })));
		expect(updated.nodes.map((n) => n.path)).toEqual(['a', 'b', 'a/x']);
		expect(nodeAt(updated.nodes, 'a/x')?.title).toBe('Renamed');
		expect(base.nodes).toHaveLength(2);
	});

	it('drops a removed node by path', () => {
		const next = applyEvent(base, event(6, 'node_removed', { path: 'a/x' }));
		expect(next.nodes.map((n) => n.path)).toEqual(['a']);
	});

	it('upserts notes by id in createdAt order and drops removed ones', () => {
		const added = applyEvent(
			base,
			event(6, 'note', note('n0', { createdAt: '2025-12-31T00:00:00.000Z' }))
		);
		expect(added.notes.map((n) => n.id)).toEqual(['n0', 'n1']);
		const edited = applyEvent(added, event(7, 'note', note('n1', { text: 'edited' })));
		expect(edited.notes.find((n) => n.id === 'n1')?.text).toBe('edited');
		expect(edited.notes).toHaveLength(2);
		const removed = applyEvent(edited, event(8, 'note_removed', { id: 'n0' }));
		expect(removed.notes.map((n) => n.id)).toEqual(['n1']);
	});

	it('changes only lastSeq on send', () => {
		const next = applyEvent(base, event(6, 'send', { count: 1, at: T0 }));
		expect(next.lastSeq).toBe(6);
		expect(next.nodes).toBe(base.nodes);
		expect(next.notes).toBe(base.notes);
		expect(next.topic).toBe(base.topic);
	});
});

describe('tree helpers', () => {
	const nodes = [
		node('a', { kind: 'area', position: 1 }),
		node('b', { kind: 'area', position: 0 }),
		node('a/z', { position: 0 }),
		node('a/y', { position: 0 }),
		node('a/y/deep', { position: 0 }),
		node('a/w', { position: 2 })
	];

	it('childrenOf orders by position, then path', () => {
		expect(childrenOf(nodes, null).map((n) => n.path)).toEqual(['b', 'a']);
		expect(childrenOf(nodes, 'a').map((n) => n.path)).toEqual(['a/y', 'a/z', 'a/w']);
		expect(childrenOf(nodes, 'b')).toEqual([]);
	});

	it('descendantsOf excludes the node and orders by depth, position, path', () => {
		expect(descendantsOf(nodes, 'a').map((n) => n.path)).toEqual(['a/y', 'a/z', 'a/w', 'a/y/deep']);
		expect(descendantsOf(nodes, 'b')).toEqual([]);
	});

	it('descendantsOf does not treat a shared prefix as containment', () => {
		const tricky = [node('ab'), node('a'), node('a/b')];
		expect(descendantsOf(tricky, 'a').map((n) => n.path)).toEqual(['a/b']);
	});

	it('ancestorsOf lists every proper prefix, outermost first', () => {
		expect(ancestorsOf('a/b/c')).toEqual(['a', 'a/b']);
		expect(ancestorsOf('a')).toEqual([]);
	});

	it('nodeAt finds by exact path', () => {
		expect(nodeAt(nodes, 'a/y')?.path).toBe('a/y');
		expect(nodeAt(nodes, 'a/q')).toBeUndefined();
	});
});

describe('isUnknown', () => {
	it('is true only for open decisions, assumptions, fog and risks', () => {
		for (const kind of ['decision', 'assumption', 'fog', 'risk'] as const) {
			expect(isUnknown(node('x', { kind }))).toBe(true);
			expect(isUnknown(node('x', { kind, status: 'settled' }))).toBe(false);
			expect(isUnknown(node('x', { kind, status: 'parked' }))).toBe(false);
		}
		for (const kind of ['area', 'fact', 'term', 'constraint'] as const) {
			expect(isUnknown(node('x', { kind }))).toBe(false);
		}
	});
});

describe('countsOf and progressOf', () => {
	const nodes = [
		node('a', { kind: 'area' }),
		node('a/q1'),
		node('a/q2', { status: 'settled' }),
		node('a/as', { kind: 'assumption' }),
		node('b', { kind: 'area' }),
		node('b/fog', { kind: 'fog' }),
		node('b/risk', { kind: 'risk' }),
		node('b/fact', { kind: 'fact', status: 'settled' }),
		node('b/q3', { status: 'dropped' }),
		node('b/q4', { status: 'parked' })
	];

	it('counts open unknowns, settled and total over the whole topic, skipping areas', () => {
		expect(countsOf(nodes)).toEqual({
			questions: 1,
			assumptions: 1,
			fog: 1,
			risks: 1,
			settled: 2,
			total: 8
		});
		expect(countsOf(nodes, null)).toEqual(countsOf(nodes));
	});

	it('counts the node at path and its descendants only', () => {
		expect(countsOf(nodes, 'a')).toEqual({
			questions: 1,
			assumptions: 1,
			fog: 0,
			risks: 0,
			settled: 1,
			total: 3
		});
		expect(countsOf(nodes, 'a/q1').questions).toBe(1);
		expect(countsOf(nodes, 'a/q1').total).toBe(1);
	});

	it('progressOf is settled decisions over decisions that are not dropped', () => {
		expect(progressOf(nodes)).toEqual({ settled: 1, total: 3 });
		expect(progressOf([])).toEqual({ settled: 0, total: 0 });
	});
});

describe('frontier', () => {
	const nodes = [
		node('base', { status: 'settled' }),
		node('open-dep'),
		node('r2', { rank: 2, edges: [{ rel: 'relies_on', to: 'base' }] }),
		node('r1', { rank: 1 }),
		node('unranked', { depth: 1, position: 3 }),
		node('cur', { rank: 0 }),
		node('lean', {
			rank: 3,
			edges: [
				{ rel: 'relies_on', to: 'missing' },
				{ rel: 'relates', to: 'open-dep' },
				{ rel: 'relies_on', to: 'base' },
				{ rel: 'relies_on', to: 'open-dep' }
			]
		}),
		node('as', { kind: 'assumption' }),
		node('as2', { kind: 'assumption', status: 'settled' }),
		node('f/g', { kind: 'fog' }),
		node('f', { kind: 'fog', position: 1 }),
		node('risk', { kind: 'risk' })
	];

	it('splits open decisions into current, ready and leaning in rank order', () => {
		const f = frontier(nodes, 'cur');
		expect(f.current?.path).toBe('cur');
		expect(f.ready.map((n) => n.path)).toEqual(['r1', 'r2', 'open-dep', 'unranked']);
		expect(f.leaning).toEqual([
			{ node: nodeAt(nodes, 'lean'), waitingOn: ['missing', 'open-dep'] }
		]);
	});

	it('leaves current null when the current node is not open, and ranks it with the rest', () => {
		const settledCur = nodes.map((n) =>
			n.path === 'cur' ? { ...n, status: 'settled' as const } : n
		);
		expect(frontier(settledCur, 'cur').current).toBeNull();
		const f = frontier(nodes, null);
		expect(f.current).toBeNull();
		expect(f.ready[0].path).toBe('cur');
		expect(frontier(nodes, 'nope').current).toBeNull();
	});

	it('lists open assumptions, fog and risks by depth, position, path', () => {
		const f = frontier(nodes, null);
		expect(f.assumptions.map((n) => n.path)).toEqual(['as']);
		expect(f.fog.map((n) => n.path)).toEqual(['f', 'f/g']);
		expect(f.risks.map((n) => n.path)).toEqual(['risk']);
	});

	it('orders unranked decisions by depth, then position, then path', () => {
		const flat = [
			node('x/b', { position: 0 }),
			node('a', { position: 5 }),
			node('x/a', { position: 0 })
		];
		expect(frontier(flat, null).ready.map((n) => n.path)).toEqual(['a', 'x/a', 'x/b']);
	});
});

describe('questionList', () => {
	const nodes = [
		node('cur', { rank: 1 }),
		node('ready', { rank: 2 }),
		node('lean', { rank: 3, edges: [{ rel: 'relies_on', to: 'ready' }] }),
		node('parked', { status: 'parked' }),
		node('old', { status: 'settled', statusSince: at(1) }),
		node('new', { status: 'settled', statusSince: at(5) }),
		node('gone', { status: 'dropped' }),
		node('as', { kind: 'assumption' }),
		node('as-parked', { kind: 'assumption', status: 'parked' }),
		node('as-done', { kind: 'assumption', status: 'settled', statusSince: at(3) }),
		node('fog', { kind: 'fog' }),
		node('fact', { kind: 'fact', status: 'settled' })
	];

	it('groups decisions in sidebar order and leaves empty groups out', () => {
		const groups = questionList(nodes, 'cur');
		expect(groups.map((g) => [g.key, g.label, g.nodes.map((n) => n.path)])).toEqual([
			['current', 'Now asking', ['cur']],
			['ready', 'Ready', ['ready']],
			['leaning', 'Waiting', ['lean']],
			['parked', 'Parked', ['parked']],
			['settled', 'Settled', ['new', 'old']],
			['dropped', 'Dropped', ['gone']]
		]);
	});

	it('adds the included kinds to their open, parked and settled groups', () => {
		const groups = questionList(nodes, 'cur', ['assumption', 'fog']);
		const byKey = Object.fromEntries(groups.map((g) => [g.key, g.nodes.map((n) => n.path)]));
		expect(byKey.open).toEqual(['as', 'fog']);
		expect(byKey.parked).toEqual(['as-parked', 'parked']);
		expect(byKey.settled).toEqual(['new', 'as-done', 'old']);
		expect(groups.map((g) => g.key)).toEqual([
			'current',
			'ready',
			'leaning',
			'open',
			'parked',
			'settled',
			'dropped'
		]);
	});

	it('never lists facts, terms, constraints or areas', () => {
		const all = questionList(nodes, null, ['assumption', 'fog', 'risk']).flatMap((g) => g.nodes);
		expect(all.some((n) => n.kind === 'fact')).toBe(false);
	});

	it('returns no groups for an empty topic', () => {
		expect(questionList([], null)).toEqual([]);
	});
});

describe('lodFor', () => {
	it('switches at LOD_MID and LOD_NEAR', () => {
		expect(LOD_MID).toBe(0.5);
		expect(LOD_NEAR).toBe(1.0);
		expect(lodFor(0.1)).toBe('far');
		expect(lodFor(0.49)).toBe('far');
		expect(lodFor(0.5)).toBe('mid');
		expect(lodFor(0.99)).toBe('mid');
		expect(lodFor(1)).toBe('near');
		expect(lodFor(2)).toBe('near');
	});
});

describe('notes helpers', () => {
	const nodes = [node('a', { kind: 'area' }), node('a/b'), node('a/b/c'), node('ab')];
	const notes = [
		note('3', { anchor: { path: 'a/b' }, createdAt: at(3) }),
		note('1', { anchor: { path: 'a' }, createdAt: at(1) }),
		note('2', { anchor: { path: 'a/b/c' }, createdAt: at(2) }),
		note('4', { anchor: { path: 'ab' }, createdAt: at(4) }),
		note('5', { anchor: { path: null }, createdAt: at(0) })
	];

	it('notesOn matches the exact anchor path in createdAt order', () => {
		expect(notesOn(notes, 'a').map((n) => n.id)).toEqual(['1']);
		expect(notesOn(notes, null).map((n) => n.id)).toEqual(['5']);
	});

	it('notesOn with subtree adds notes on descendants only', () => {
		expect(notesOn(notes, 'a', { subtree: true, nodes }).map((n) => n.id)).toEqual(['1', '2', '3']);
	});

	it('marksOf counts unresolved notes per element of one widget', () => {
		const pinned = [
			note('m1', { anchor: { path: 'a/b', widget: 'w', element: 'users.id' } }),
			note('m2', { anchor: { path: 'a/b', widget: 'w', element: 'users.id' } }),
			note('m3', { anchor: { path: 'a/b', widget: 'w', element: 'users.email' } }),
			note('m4', { anchor: { path: 'a/b', widget: 'w', element: 'users.id' }, status: 'resolved' }),
			note('m5', { anchor: { path: 'a/b', widget: 'other', element: 'users.id' } }),
			note('m6', { anchor: { path: 'a/b', widget: 'w' } }),
			note('m7', {
				anchor: { path: 'a/b/c', widget: 'w', element: 'users.id' },
				status: 'delivered'
			})
		];
		expect(marksOf(pinned, 'a/b', 'w')).toEqual({ 'users.id': 2, 'users.email': 1 });
		expect(marksOf(pinned, 'a/b/c', 'w')).toEqual({ 'users.id': 1 });
		expect(marksOf(pinned, 'zzz', 'w')).toEqual({});
	});

	it('pendingAnswer is the newest unresolved answering note on the node itself', () => {
		const list = [
			note('old', { anchor: { path: 'q' }, intent: 'answer', createdAt: at(1) }),
			note('new', { anchor: { path: 'q' }, intent: 'defer', createdAt: at(2) }),
			note('comment', { anchor: { path: 'q' }, intent: 'comment', createdAt: at(3) }),
			note('pinned', { anchor: { path: 'q', widget: 'w' }, intent: 'accept', createdAt: at(4) }),
			note('done', { anchor: { path: 'q' }, intent: 'drop', createdAt: at(5), status: 'resolved' })
		];
		expect(pendingAnswer(list, 'q')?.id).toBe('new');
		expect(pendingAnswer(list, 'other')).toBeUndefined();
		const delivered = [note('d', { anchor: { path: 'q' }, intent: 'accept', status: 'delivered' })];
		expect(pendingAnswer(delivered, 'q')?.id).toBe('d');
	});

	it('queuedCount counts queued notes', () => {
		expect(
			queuedCount([
				note('a'),
				note('b', { sentAt: T0 }),
				note('c', { status: 'delivered' }),
				note('d', { status: 'resolved' })
			])
		).toBe(2);
	});
});

describe('freshSince', () => {
	const nodes = [node('a', { updatedAt: at(1) }), node('b', { updatedAt: at(5) })];

	it('lists paths updated strictly after since', () => {
		expect([...freshSince(nodes, at(1))]).toEqual(['b']);
		expect([...freshSince(nodes, at(0))]).toEqual(['a', 'b']);
		expect([...freshSince(nodes, at(9))]).toEqual([]);
	});

	it('is empty without a last visit', () => {
		expect(freshSince(nodes, null).size).toBe(0);
	});
});

describe('defaultIntent', () => {
	it('picks the intent by kind and status', () => {
		expect(defaultIntent(node('q'))).toBe('answer');
		expect(defaultIntent(node('q', { status: 'settled' }))).toBe('comment');
		expect(defaultIntent(node('a', { kind: 'assumption' }))).toBe('accept');
		expect(defaultIntent(node('a', { kind: 'assumption', status: 'settled' }))).toBe('comment');
		expect(defaultIntent(node('f', { kind: 'fog' }))).toBe('explore');
		expect(defaultIntent(node('r', { kind: 'risk' }))).toBe('comment');
		expect(defaultIntent(null)).toBe('comment');
	});
});

describe('incomingEdges', () => {
	it('lists edges from other nodes that point at the path', () => {
		const nodes = [
			node('b', {
				edges: [
					{ rel: 'relates', to: 'a' },
					{ rel: 'relies_on', to: 'c' }
				]
			}),
			node('a', { edges: [{ rel: 'relates', to: 'a' }] }),
			node('c', { edges: [{ rel: 'conflicts', to: 'a', label: 'x' }] })
		];
		expect(incomingEdges(nodes, 'a')).toEqual([
			{ from: 'b', edge: { rel: 'relates', to: 'a' } },
			{ from: 'c', edge: { rel: 'conflicts', to: 'a', label: 'x' } }
		]);
		expect(incomingEdges(nodes, 'zzz')).toEqual([]);
	});
});
