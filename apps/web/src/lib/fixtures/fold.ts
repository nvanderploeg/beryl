import type { Node, NodeInput, Note, PalantirEvent, Project, Snapshot, Topic } from '#lib/types.ts';
import { ancestorsOf, byTree } from '#lib/ui/topic.ts';
import type { DemoFixture, DemoTurn } from './types.ts';

export const DEMO_PROJECT_ID = '5f0c2a8e-3b1d-4e6f-9a7c-2d4b6e8f0a1c';
export const DEMO_TOPIC_ID = '9c3e7a1f-5d2b-4f8e-8b6a-4c1e3a5d7f9b';
export const DEMO_START = '2026-03-02T09:00:00.000Z';
const TURN_MS = 5 * 60_000;
const STEP_MS = 1_000;

export interface FoldResult {
	snapshot: Snapshot;
	events: PalantirEvent[];
}

// Turn 0 is the Topic's creation; turn n starts here, and all of its writes land after it.
export function turnStart(turn: number): string {
	return new Date(Date.parse(DEMO_START) + turn * TURN_MS).toISOString();
}

function noteId(index: number): string {
	return `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
}

function same(a: unknown, b: unknown): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}

function rowChanged(before: Node | undefined, after: Node): boolean {
	if (!before) return true;
	return !same({ ...before, updatedAt: '' }, { ...after, updatedAt: '' });
}

function defaultStatus(kind: Node['kind']): Node['status'] {
	return kind === 'fact' || kind === 'term' || kind === 'constraint' ? 'settled' : 'open';
}

const MEANING: readonly (keyof Node)[] = [
	'kind',
	'status',
	'title',
	'gist',
	'recommendation',
	'answer'
];

class Folder {
	project: Project;
	topic: Topic;
	nodes = new Map<string, Node>();
	notes: Note[] = [];
	events: PalantirEvent[] = [];
	private seq = 0;
	private turn = 0;
	private step = 0;

	constructor(fixture: DemoFixture) {
		const now = this.stamp();
		this.project = {
			id: DEMO_PROJECT_ID,
			name: fixture.project.name,
			createdAt: now,
			lastWriteAt: now
		};
		this.topic = {
			id: DEMO_TOPIC_ID,
			projectId: DEMO_PROJECT_ID,
			title: fixture.topic.title,
			destination: fixture.topic.destination ?? '',
			summary: fixture.topic.summary ?? '',
			status: 'open',
			current: null,
			agent: null,
			repo: null,
			branch: null,
			createdAt: now,
			updatedAt: now,
			closedAt: null
		};
		this.emit('topic', null, this.topic, now);
	}

	beginTurn(turn: number): void {
		this.turn = turn;
		this.step = 0;
	}

	private stamp(): string {
		this.step++;
		return new Date(Date.parse(turnStart(this.turn)) + this.step * STEP_MS).toISOString();
	}

	private emit(
		type: PalantirEvent['type'],
		path: string | null,
		payload: PalantirEvent['payload'],
		at: string
	): void {
		this.events.push({ seq: ++this.seq, type, topicId: DEMO_TOPIC_ID, path, payload, at });
	}

	private touchTopic(now: string): void {
		this.topic = { ...this.topic, updatedAt: now };
		this.project = { ...this.project, lastWriteAt: now };
	}

	private hasChildren(path: string): boolean {
		for (const n of this.nodes.values()) if (n.parentPath === path) return true;
		return false;
	}

	private nextPosition(parentPath: string | null): number {
		let max = -1;
		for (const n of this.nodes.values())
			if (n.parentPath === parentPath) max = Math.max(max, n.position);
		return max + 1;
	}

	private blank(path: string, kind: Node['kind'], now: string): Node {
		const parts = path.split('/');
		const parentPath = parts.length > 1 ? parts.slice(0, -1).join('/') : null;
		return {
			topicId: DEMO_TOPIC_ID,
			path,
			parentPath,
			key: parts.at(-1)!,
			depth: parts.length,
			position: this.nextPosition(parentPath),
			kind,
			status: defaultStatus(kind),
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
			createdAt: now,
			updatedAt: now,
			statusSince: now
		};
	}

	private ensureAncestors(
		path: string,
		now: string,
		meaning: Set<string>,
		touched: string[]
	): void {
		for (const ancestor of ancestorsOf(path)) {
			if (this.nodes.has(ancestor)) continue;
			this.nodes.set(ancestor, this.blank(ancestor, 'area', now));
			meaning.add(ancestor);
			touched.push(ancestor);
		}
	}

	private markStale(meaning: Iterable<string>, named: Iterable<string>): void {
		const set = (path: string, gistStale: boolean) => {
			const n = this.nodes.get(path);
			if (n && n.gistStale !== gistStale) this.nodes.set(path, { ...n, gistStale });
		};
		for (const path of meaning) for (const a of ancestorsOf(path)) set(a, true);
		for (const path of named) set(path, false);
		for (const n of this.nodes.values())
			if (n.gistStale && !this.hasChildren(n.path)) set(n.path, false);
	}

	// One event per changed row, as docs/api.md § Node writes requires.
	private flush(before: Map<string, Node>, touched: string[], now: string): void {
		const order = [...new Set([...touched, ...this.nodes.keys()])];
		for (const path of order) {
			const after = this.nodes.get(path);
			if (!after || !rowChanged(before.get(path), after)) continue;
			const row = { ...after, updatedAt: now };
			this.nodes.set(path, row);
			this.emit('node', path, row, now);
		}
	}

	private clearCurrent(now: string): void {
		const current = this.topic.current;
		if (current === null || this.nodes.get(current)?.status === 'open') return;
		this.topic = { ...this.topic, current: null, updatedAt: now };
		this.emit('topic', null, this.topic, now);
	}

	writeNodes(inputs: NodeInput[]): void {
		const now = this.stamp();
		const before = new Map(this.nodes);
		const meaning = new Set<string>();
		const named = new Set<string>();
		const touched: string[] = [];
		for (const input of inputs) {
			this.ensureAncestors(input.path, now, meaning, touched);
			const existing = this.nodes.get(input.path);
			if (!existing && !input.kind) throw new Error(`kind is required to create ${input.path}`);
			const base = existing ?? this.blank(input.path, input.kind!, now);
			const next: Node = { ...base };
			if (input.kind !== undefined) next.kind = input.kind;
			if (input.status !== undefined) next.status = input.status;
			if (input.title !== undefined) next.title = input.title;
			if (input.gist !== undefined) next.gist = input.gist;
			if (input.body !== undefined) next.body = input.body;
			if (input.recommendation !== undefined) next.recommendation = input.recommendation;
			if (input.answer !== undefined) next.answer = input.answer;
			if (input.rank !== undefined) next.rank = input.rank;
			if (input.edges !== undefined) next.edges = input.edges;
			if (input.widgets !== undefined) next.widgets = input.widgets;
			if (input.sources !== undefined) next.sources = input.sources;
			if (input.position !== undefined) next.position = input.position;
			if (existing && next.status !== existing.status) next.statusSince = now;
			if (!existing || MEANING.some((k) => !same(existing[k], next[k]))) meaning.add(input.path);
			if (input.title !== undefined || input.gist !== undefined) named.add(input.path);
			this.nodes.set(input.path, next);
			touched.push(input.path);
		}
		this.markStale(meaning, named);
		this.flush(before, touched, now);
		this.touchTopic(now);
		this.clearCurrent(now);
	}

	remove(paths: string[]): void {
		const now = this.stamp();
		const before = new Map(this.nodes);
		const doomed = new Set<string>();
		for (const path of paths) {
			if (!this.nodes.has(path)) continue;
			for (const n of this.nodes.values()) {
				if (n.path === path || n.path.startsWith(`${path}/`)) doomed.add(n.path);
			}
		}
		const deepestFirst = [...doomed]
			.map((p) => this.nodes.get(p)!)
			.sort((a, b) => b.depth - a.depth || byTree(a, b));
		for (const n of deepestFirst) {
			this.nodes.delete(n.path);
			this.emit('node_removed', n.path, { path: n.path }, now);
		}
		this.markStale(paths, []);
		this.flush(before, [], now);
		this.touchTopic(now);
		this.clearCurrent(now);
	}

	move(from: string, to: string): void {
		const now = this.stamp();
		if (!this.nodes.has(from)) throw new Error(`no node ${from}`);
		if (this.nodes.has(to)) throw new Error(`${to} already exists`);
		if (to === from || to.startsWith(`${from}/`))
			throw new Error(`cannot move ${from} inside itself`);
		const rename = (path: string) =>
			path === from || path.startsWith(`${from}/`) ? to + path.slice(from.length) : path;
		const moving = [...this.nodes.values()].filter((n) => rename(n.path) !== n.path).sort(byTree);
		for (const n of [...moving].sort((a, b) => b.depth - a.depth || byTree(a, b))) {
			this.nodes.delete(n.path);
			this.emit('node_removed', n.path, { path: n.path }, now);
		}
		const before = new Map(this.nodes);
		const meaning = new Set<string>([from, to]);
		const touched: string[] = [];
		this.ensureAncestors(to, now, meaning, touched);
		for (const n of moving) {
			const path = rename(n.path);
			const parts = path.split('/');
			this.nodes.set(path, {
				...n,
				path,
				parentPath: parts.length > 1 ? parts.slice(0, -1).join('/') : null,
				key: parts.at(-1)!,
				depth: parts.length
			});
			touched.push(path);
		}
		for (const n of [...this.nodes.values()]) {
			const edges = n.edges.map((e) => ({ ...e, to: rename(e.to) }));
			if (!same(edges, n.edges)) this.nodes.set(n.path, { ...n, edges });
		}
		this.markStale(meaning, []);
		this.flush(before, touched, now);
		this.notes = this.notes.map((note) => {
			const path = note.anchor.path;
			if (path === null || rename(path) === path) return note;
			const moved = { ...note, anchor: { ...note.anchor, path: rename(path) }, updatedAt: now };
			this.emit('note', moved.anchor.path, moved, now);
			return moved;
		});
		if (this.topic.current !== null && rename(this.topic.current) !== this.topic.current) {
			this.topic = { ...this.topic, current: rename(this.topic.current) };
			this.emit('topic', null, this.topic, now);
		}
		this.touchTopic(now);
	}

	patchTopic(patch: NonNullable<DemoTurn['topic']>): void {
		const now = this.stamp();
		const next: Topic = { ...this.topic };
		if (patch.current !== undefined) {
			if (patch.current !== null && this.nodes.get(patch.current)?.status !== 'open') {
				throw new Error(`current must be an open node: ${patch.current}`);
			}
			next.current = patch.current;
		}
		if (patch.summary !== undefined) next.summary = patch.summary;
		if (patch.status !== undefined && patch.status !== next.status) {
			next.status = patch.status;
			next.closedAt = patch.status === 'closed' ? now : null;
		}
		if (same({ ...next, updatedAt: '' }, { ...this.topic, updatedAt: '' })) return;
		this.topic = { ...next, updatedAt: now };
		this.project = { ...this.project, lastWriteAt: now };
		this.emit('topic', null, this.topic, now);
	}

	addNote(input: NonNullable<DemoTurn['notes']>[number]): void {
		const now = this.stamp();
		if (input.anchor.path !== null && !this.nodes.has(input.anchor.path)) {
			throw new Error(`no node ${input.anchor.path}`);
		}
		const note: Note = {
			id: noteId(this.notes.length),
			topicId: DEMO_TOPIC_ID,
			anchor: { ...input.anchor },
			intent: input.intent,
			text: input.text ?? '',
			author: input.author ?? '',
			status: 'queued',
			sentAt: null,
			deliveredAt: null,
			resolvedAt: null,
			reply: '',
			changed: [],
			createdAt: now,
			updatedAt: now
		};
		this.notes.push(note);
		this.emit('note', note.anchor.path, note, now);
	}

	private updateNote(index: number, patch: Partial<Note>, now: string): void {
		const note = { ...this.notes[index], ...patch, updatedAt: now };
		this.notes[index] = note;
		this.emit('note', note.anchor.path, note, now);
	}

	send(): void {
		const now = this.stamp();
		let count = 0;
		this.notes.forEach((n, i) => {
			if (n.status !== 'queued' || n.sentAt !== null) return;
			this.updateNote(i, { sentAt: now }, now);
			count++;
		});
		if (count > 0) this.emit('send', null, { count, at: now }, now);
	}

	pull(): void {
		const now = this.stamp();
		this.notes.forEach((n, i) => {
			if (n.status === 'queued') this.updateNote(i, { status: 'delivered', deliveredAt: now }, now);
		});
	}

	resolve(items: NonNullable<DemoTurn['resolve']>): void {
		const now = this.stamp();
		for (const item of items) {
			if (!this.notes[item.note]) throw new Error(`no note #${item.note}`);
			this.updateNote(
				item.note,
				{ status: 'resolved', resolvedAt: now, reply: item.reply, changed: item.changed ?? [] },
				now
			);
		}
	}

	snapshot(): Snapshot {
		return {
			project: this.project,
			topic: this.topic,
			nodes: [...this.nodes.values()].sort(byTree),
			notes: [...this.notes].sort(
				(a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)
			),
			lastSeq: this.seq
		};
	}
}

export function foldHistory(fixture: DemoFixture, upTo?: number): FoldResult {
	const folder = new Folder(fixture);
	const turns = fixture.turns.slice(0, upTo ?? fixture.turns.length);
	turns.forEach((turn, i) => {
		folder.beginTurn(i + 1);
		if (turn.pull) folder.pull();
		if (turn.resolve?.length) folder.resolve(turn.resolve);
		if (turn.remove?.length) folder.remove(turn.remove);
		for (const m of turn.move ?? []) folder.move(m.from, m.to);
		if (turn.nodes?.length) folder.writeNodes(turn.nodes);
		if (turn.topic) folder.patchTopic(turn.topic);
		for (const note of turn.notes ?? []) folder.addNote(note);
		if (turn.send) folder.send();
	});
	return { snapshot: folder.snapshot(), events: folder.events };
}

export function foldTurns(fixture: DemoFixture, upTo?: number): Snapshot {
	return foldHistory(fixture, upTo).snapshot;
}
