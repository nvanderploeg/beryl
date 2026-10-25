import { describe, it, expect } from 'vitest';
import {
	formatOutline,
	formatPulled,
	type Node,
	type Note,
	type Pulled,
	type Snapshot
} from './index.ts';

const T = '2026-10-24T00:00:00.000Z';
const TOPIC_ID = '0b5f8a52-8c55-4c1e-9d7e-3f2a1c9b8e77';
const N1 = '6f1c2d3e-0000-4000-8000-000000000001';
const N2 = '9a2e4b5c-0000-4000-8000-000000000002';
const N3 = '1b7d6e7f-0000-4000-8000-000000000003';

function note(id: string, fields: Partial<Note> = {}): Note {
	return {
		id,
		topicId: TOPIC_ID,
		anchor: { path: null },
		intent: 'comment',
		text: '',
		author: '',
		status: 'delivered',
		sentAt: null,
		deliveredAt: T,
		resolvedAt: null,
		reply: '',
		changed: [],
		createdAt: T,
		updatedAt: T,
		...fields
	};
}

function node(path: string, fields: Partial<Node> = {}): Node {
	const keys = path.split('/');
	return {
		topicId: TOPIC_ID,
		path,
		parentPath: keys.length > 1 ? keys.slice(0, -1).join('/') : null,
		key: keys[keys.length - 1],
		depth: keys.length,
		position: 0,
		kind: 'area',
		status: 'open',
		title: keys[keys.length - 1],
		gist: '',
		body: '',
		recommendation: '',
		answer: '',
		rank: null,
		edges: [],
		widgets: [],
		sources: [],
		gistStale: false,
		createdAt: T,
		updatedAt: T,
		statusSince: T,
		...fields
	};
}

function snapshot(nodes: Node[], fields: Partial<Snapshot['topic']> = {}, notes: Note[] = []) {
	return {
		project: { id: 'proj-1', name: 'repo', createdAt: T, lastWriteAt: T },
		topic: {
			id: TOPIC_ID,
			projectId: 'proj-1',
			title: 'Payments retry design',
			destination: '',
			summary: '',
			status: 'open',
			current: null,
			agent: null,
			repo: null,
			branch: null,
			createdAt: T,
			updatedAt: T,
			closedAt: null,
			...fields
		},
		nodes,
		notes,
		lastSeq: 0
	} satisfies Snapshot;
}

const empty: Pulled = { notes: [], unresolved: [], context: {}, stale: [] };

describe('formatPulled', () => {
	it('renders the contract example exactly', () => {
		const pulled: Pulled = {
			notes: [
				note(N1, {
					anchor: { path: 'storage/engine' },
					intent: 'answer',
					text: 'MySQL, same as chronicle.'
				}),
				note(N2, {
					anchor: { path: 'storage/schema', widget: 'tables', element: 'users.email' },
					intent: 'comment',
					text: 'should be unique.',
					author: 'Sam'
				})
			],
			unresolved: [
				note(N3, {
					anchor: { path: 'auth/session' },
					intent: 'correct',
					text: 'tokens, not cookies.'
				})
			],
			context: {
				'storage/engine': { title: 'Pick the database', kind: 'decision', status: 'open' },
				'storage/schema': { title: 'Tables', kind: 'fact', status: 'settled' },
				'auth/session': { title: 'Session storage', kind: 'decision', status: 'open' }
			},
			stale: [
				{ path: 'storage', title: 'Storage' },
				{ path: 'auth', title: 'Auth' }
			]
		};

		expect(formatPulled(pulled, { id: TOPIC_ID, title: 'Payments retry design' })).toBe(
			[
				`palantir: 2 new notes from the board on topic ${TOPIC_ID} (Payments retry design):`,
				`- [answer] storage/engine "Pick the database": MySQL, same as chronicle. (note ${N1})`,
				`- [comment] storage/schema "Tables" › tables › users.email: should be unique. (by Sam) (note ${N2})`,
				'Still unresolved from earlier:',
				`- [correct] auth/session "Session storage": tokens, not cookies. (note ${N3})`,
				'Stale gists: storage, auth.',
				'Fold each note into the model, then call resolve_notes with a one-line reply for each.'
			].join('\n')
		);
	});

	it('says there is nothing new in one line when the board is quiet', () => {
		expect(formatPulled(empty, { id: TOPIC_ID, title: 'Payments retry design' })).toBe(
			`palantir: no new notes on the board for topic ${TOPIC_ID}.`
		);
	});

	it('prints unresolved notes in full without new notes, and keeps the closing line', () => {
		const pulled: Pulled = {
			...empty,
			unresolved: [
				note(N1, { anchor: { path: null }, intent: 'explore', text: 'What about queues?' }),
				note(N2, { anchor: { path: 'a', widget: 'w' }, intent: 'drop', author: 'Sam' })
			],
			context: { a: { title: 'A', kind: 'decision', status: 'open' } },
			stale: [{ path: 'a', title: 'A' }]
		};

		expect(formatPulled(pulled, { id: TOPIC_ID })).toBe(
			[
				`palantir: no new notes on the board for topic ${TOPIC_ID}.`,
				'Still unresolved from earlier:',
				`- [explore] topic: What about queues? (note ${N1})`,
				`- [drop] a "A" › w: drop this (by Sam) (note ${N2})`,
				'Stale gists: a.',
				'Fold each note into the model, then call resolve_notes with a one-line reply for each.'
			].join('\n')
		);
	});

	it('leaves the closing line out when only stale gists remain', () => {
		expect(formatPulled({ ...empty, stale: [{ path: 'a', title: 'A' }] }, { id: TOPIC_ID })).toBe(
			`palantir: no new notes on the board for topic ${TOPIC_ID}.\nStale gists: a.`
		);
	});

	it('speaks of one note in the singular and leaves the title out when not given', () => {
		const pulled: Pulled = {
			...empty,
			notes: [note(N1, { anchor: { path: null }, intent: 'comment', text: 'Looks right.' })]
		};

		expect(formatPulled(pulled, { id: TOPIC_ID })).toBe(
			[
				`palantir: 1 new note from the board on topic ${TOPIC_ID}:`,
				`- [comment] topic: Looks right. (note ${N1})`,
				'Fold each note into the model, then call resolve_notes with a one-line reply for each.'
			].join('\n')
		);
	});

	it('words an empty accept, defer or drop', () => {
		const pulled: Pulled = {
			...empty,
			notes: [
				note(N1, { anchor: { path: 'q' }, intent: 'accept' }),
				note(N2, { anchor: { path: 'q' }, intent: 'defer' }),
				note(N3, { anchor: { path: 'q' }, intent: 'drop', text: 'out of scope' })
			],
			context: { q: { title: 'Q', kind: 'decision', status: 'open' } }
		};

		expect(formatPulled(pulled, { id: TOPIC_ID }).split('\n').slice(1, 4)).toEqual([
			`- [accept] q "Q": accept the recommendation (note ${N1})`,
			`- [defer] q "Q": defer this (note ${N2})`,
			`- [drop] q "Q": out of scope (note ${N3})`
		]);
	});

	it('names a path missing from context bare and indents a multi-line note', () => {
		const pulled: Pulled = {
			...empty,
			notes: [
				note(N1, {
					anchor: { path: 'gone', widget: 'cols', element: 'id' },
					intent: 'correct',
					text: 'first\nsecond'
				})
			]
		};

		expect(formatPulled(pulled, { id: TOPIC_ID }).split('\n').slice(1, 3)).toEqual([
			'- [correct] gone › cols › id: first',
			`  second (note ${N1})`
		]);
	});

	it('does not read a path named like an object builtin from the prototype', () => {
		const pulled: Pulled = {
			...empty,
			notes: [note(N1, { anchor: { path: 'constructor' }, intent: 'comment', text: 'x' })]
		};

		expect(formatPulled(pulled, { id: TOPIC_ID })).toContain(
			`- [comment] constructor: x (note ${N1})`
		);
	});
});

describe('formatOutline', () => {
	it('renders the contract example exactly', () => {
		const snap = snapshot(
			[
				node('storage', {
					title: 'Storage',
					gist: 'Where the model and events live.',
					gistStale: true
				}),
				node('storage/engine', {
					kind: 'decision',
					title: 'Pick the database',
					gist: 'MySQL or SQLite?',
					rank: 1
				})
			],
			{ current: 'storage/engine' },
			[
				note(N1, { status: 'queued' }),
				note(N2, { status: 'queued' }),
				note(N3, { status: 'delivered' }),
				note('n4', { status: 'resolved' })
			]
		);

		expect(formatOutline(snap)).toBe(
			[
				'Topic "Payments retry design" (open)',
				'storage [area/open]* Storage — Where the model and events live.',
				'  storage/engine [decision/open] #1 Pick the database — MySQL or SQLite? ← now asking',
				'Notes: 2 queued, 1 delivered and unresolved.'
			].join('\n')
		);
	});

	it('adds the destination when set and walks the tree depth first in position order', () => {
		const snap = snapshot(
			[
				node('b', { position: 1, title: 'B' }),
				node('a', { position: 0, title: 'A' }),
				node('a/y', { position: 1, kind: 'fact', status: 'settled', title: 'Y' }),
				node('a/x', { position: 0, kind: 'term', status: 'settled', title: 'X' }),
				node('a/x/deep', { kind: 'fog', title: 'Deep' })
			],
			{ destination: 'A spec for retries', status: 'closed' }
		);

		expect(formatOutline(snap)).toBe(
			[
				'Topic "Payments retry design" (closed)',
				'Destination: A spec for retries',
				'a [area/open] A',
				'  a/x [term/settled] X',
				'    a/x/deep [fog/open] Deep',
				'  a/y [fact/settled] Y',
				'b [area/open] B',
				'Notes: 0 queued, 0 delivered and unresolved.'
			].join('\n')
		);
	});

	it('shows a rank only on an open decision', () => {
		const snap = snapshot([
			node('d1', { kind: 'decision', rank: 2, title: 'Open' }),
			node('d2', { kind: 'decision', status: 'settled', rank: 0, title: 'Settled' }),
			node('d3', { kind: 'decision', title: 'Unranked' }),
			node('r', { kind: 'risk', rank: 3, title: 'Risk' })
		]);

		expect(formatOutline(snap).split('\n').slice(1, 5)).toEqual([
			'd1 [decision/open] #2 Open',
			'd2 [decision/settled] Settled',
			'd3 [decision/open] Unranked',
			'r [risk/open] Risk'
		]);
	});

	it('limits the outline to a subtree, indented from its root', () => {
		const snap = snapshot([
			node('a', { title: 'A' }),
			node('b', { title: 'B' }),
			node('b/c', { title: 'C' }),
			node('b/c/d', { title: 'D' })
		]);

		expect(formatOutline(snap, { path: 'b/c' })).toBe(
			[
				'Topic "Payments retry design" (open)',
				'b/c [area/open] C',
				'  b/c/d [area/open] D',
				'Notes: 0 queued, 0 delivered and unresolved.'
			].join('\n')
		);
	});

	it('says so when the subtree root is missing', () => {
		expect(formatOutline(snapshot([node('a')]), { path: 'zzz' }).split('\n')[1]).toBe(
			'No node zzz.'
		);
	});

	it('adds bodies, answers, edges, sources and widgets in full detail', () => {
		const snap = snapshot([
			node('storage', { title: 'Storage' }),
			node('storage/engine', {
				kind: 'decision',
				status: 'settled',
				title: 'Pick the database',
				body: 'Both are fine.\nMySQL is already running.',
				recommendation: 'MySQL',
				answer: 'MySQL, same as chronicle.',
				edges: [
					{ rel: 'relies_on', to: 'storage/load' },
					{ rel: 'conflicts', to: 'auth', label: 'one pool' }
				],
				sources: [
					{ file: 'docs/api.md', line: 12 },
					{ url: 'https://mysql.com', label: 'MySQL' }
				],
				widgets: [
					{
						key: 'opts',
						type: 'options',
						data: { options: [{ key: 'mysql', title: 'MySQL' }] }
					}
				]
			})
		]);

		expect(formatOutline(snap, { detail: 'full' })).toBe(
			[
				'Topic "Payments retry design" (open)',
				'storage [area/open] Storage',
				'  storage/engine [decision/settled] Pick the database',
				'      body: Both are fine.',
				'        MySQL is already running.',
				'      recommendation: MySQL',
				'      answer: MySQL, same as chronicle.',
				'      → relies_on storage/load',
				'      → conflicts auth (one pool)',
				'      source: docs/api.md:12',
				'      source: https://mysql.com (MySQL)',
				'      widget opts (options): {"options":[{"key":"mysql","title":"MySQL"}]}',
				'Notes: 0 queued, 0 delivered and unresolved.'
			].join('\n')
		);
	});

	it('shows no detail lines in the default outline', () => {
		const snap = snapshot([node('a', { body: 'hidden', edges: [{ rel: 'relates', to: 'b' }] })]);

		expect(formatOutline(snap, { detail: 'outline' })).not.toMatch(/hidden|relates/);
	});
});
