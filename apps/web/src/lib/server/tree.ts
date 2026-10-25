import { ApiError } from '#lib/server/api.ts';
import { MAX_DEPTH, MAX_PATH } from '#lib/server/parse.ts';
import type { NodeRow } from '#lib/server/serialize.ts';
import type { Edge, NodeInput, NodeKind } from '#lib/types.ts';

export const MAX_NODES = 2000;

const SETTLED_ON_CREATE: readonly NodeKind[] = ['fact', 'term', 'constraint'];
const MEANING = ['kind', 'status', 'title', 'gist', 'recommendation', 'answer'] as const;
const SCALARS = [
	'parentPath',
	'key',
	'depth',
	'position',
	'kind',
	'status',
	'title',
	'gist',
	'body',
	'recommendation',
	'answer',
	'rank',
	'gistStale'
] as const;
const ARRAYS = ['edges', 'widgets', 'sources'] as const;

export function parentOf(path: string): string | null {
	const cut = path.lastIndexOf('/');
	return cut === -1 ? null : path.slice(0, cut);
}

function ancestorsOf(path: string): string[] {
	const out: string[] = [];
	for (let parent = parentOf(path); parent !== null; parent = parentOf(parent)) out.push(parent);
	return out;
}

const depthOf = (path: string) => path.split('/').length;
const keyOf = (path: string) => path.slice(path.lastIndexOf('/') + 1);
const deepestFirst = (a: string, b: string) => depthOf(b) - depthOf(a) || (a < b ? -1 : 1);
const shallowestFirst = (a: string, b: string) => depthOf(a) - depthOf(b) || (a < b ? -1 : 1);

// MySQL JSON columns reorder object keys, so compare JSON by value, never by its text.
function canonical(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
	if (typeof value === 'object' && value !== null) {
		const entries = Object.entries(value)
			.filter(([, v]) => v !== undefined)
			.sort(([a], [b]) => (a < b ? -1 : 1));
		return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
	}
	return JSON.stringify(value);
}

export const sameJson = (a: unknown, b: unknown) => canonical(a) === canonical(b);

function differs(a: NodeRow, b: NodeRow): boolean {
	return (
		SCALARS.some((field) => a[field] !== b[field]) ||
		ARRAYS.some((field) => !sameJson(a[field], b[field]))
	);
}

export interface TreeChange {
	row: NodeRow;
	isNew: boolean;
}

export interface TreeResult {
	removed: string[];
	changes: TreeChange[];
	current: string | null;
	currentChanged: boolean;
}

// Apply every write of one batch, then call `finish` exactly once.
export class Tree {
	readonly rows: Map<string, NodeRow>;
	private readonly original: Map<string, NodeRow>;
	private readonly touched = new Set<string>();
	private readonly removed = new Set<string>();
	private readonly moved = new Set<string>();
	private readonly staleAnchors = new Set<string>();
	private readonly given = new Set<string>();
	private readonly startCurrent: string | null;
	current: string | null;

	constructor(
		private readonly topicId: string,
		rows: NodeRow[],
		current: string | null,
		private readonly now: Date
	) {
		this.rows = new Map(rows.map((row) => [row.path, row]));
		this.original = new Map(this.rows);
		this.current = this.startCurrent = current;
	}

	put(input: NodeInput): void {
		const existing = this.rows.get(input.path);
		if (!existing && input.kind === undefined) {
			throw new ApiError(400, `kind is required to create ${input.path}`);
		}
		this.ensureAncestors(input.path);
		if (existing) this.update(existing, input);
		else this.create(input.path, input);
		if (input.title !== undefined || input.gist !== undefined) this.given.add(input.path);
	}

	remove(path: string): void {
		if (!this.rows.has(path)) return;
		for (const p of this.subtree(path)) {
			this.rows.delete(p);
			this.removed.add(p);
		}
		this.staleAnchors.add(path);
	}

	move(
		from: string,
		to: string
	): { mapping: Map<string, string>; moved: { from: string; to: string }[] } {
		const root = this.rows.get(from);
		if (!root) throw new ApiError(400, `no node ${from}`);
		if (to === from || to.startsWith(`${from}/`)) {
			throw new ApiError(400, `cannot move ${from} inside itself`);
		}
		if (this.rows.has(to)) throw new ApiError(400, `node ${to} already exists`);
		const subtree = this.subtree(from).sort(shallowestFirst);
		const mapping = new Map(subtree.map((p) => [p, `${to}${p.slice(from.length)}`]));
		for (const next of mapping.values()) {
			if (depthOf(next) > MAX_DEPTH) {
				throw new ApiError(400, `moving ${from} to ${to} puts ${next} deeper than ${MAX_DEPTH}`);
			}
			if (next.length > MAX_PATH) {
				throw new ApiError(400, `moving ${from} to ${to} makes ${next} longer than ${MAX_PATH}`);
			}
		}
		this.ensureAncestors(to);
		const newParent = parentOf(to);
		const rootPosition =
			newParent === root.parentPath ? root.position : this.nextPosition(newParent);
		const old = subtree.map((p) => this.rows.get(p)!);
		for (const row of old) {
			this.rows.delete(row.path);
			this.removed.add(row.path);
		}
		for (const row of old) {
			const path = mapping.get(row.path)!;
			const isRoot = row.path === from;
			this.set({
				...row,
				path,
				parentPath: parentOf(path),
				key: isRoot ? keyOf(to) : row.key,
				depth: depthOf(path),
				position: isRoot ? rootPosition : row.position,
				updatedAt: this.now
			});
			this.moved.add(path);
		}
		for (const row of [...this.rows.values()]) {
			const edges = row.edges as Edge[];
			if (!edges.some((edge) => mapping.has(edge.to))) continue;
			this.set({
				...row,
				edges: edges.map((edge) =>
					mapping.has(edge.to) ? { ...edge, to: mapping.get(edge.to)! } : edge
				)
			});
		}
		this.staleAnchors.add(from);
		this.staleAnchors.add(to);
		if (this.current !== null && mapping.has(this.current)) {
			this.current = mapping.get(this.current)!;
		}
		return { mapping, moved: subtree.map((p) => ({ from: p, to: mapping.get(p)! })) };
	}

	finish(): TreeResult {
		for (const path of this.touched) {
			const row = this.rows.get(path);
			const before = this.original.get(path);
			if (!row || this.moved.has(path)) continue;
			if (!before || MEANING.some((field) => row[field] !== before[field])) {
				this.staleAnchors.add(path);
			}
		}
		const parents = new Set([...this.rows.values()].map((row) => row.parentPath));
		const marks = new Map<string, boolean>();
		for (const anchor of this.staleAnchors) {
			for (const ancestor of ancestorsOf(anchor)) {
				if (this.rows.has(ancestor)) marks.set(ancestor, true);
			}
		}
		for (const path of this.given) if (this.rows.has(path)) marks.set(path, false);
		for (const [path, mark] of marks) {
			const row = this.rows.get(path)!;
			const stale = mark && parents.has(path);
			if (row.gistStale !== stale) this.set({ ...row, gistStale: stale });
		}

		if (this.current !== null && this.rows.get(this.current)?.status !== 'open') {
			this.current = null;
		}

		const changes: TreeChange[] = [];
		for (const path of this.touched) {
			const row = this.rows.get(path);
			if (!row) continue;
			const before = this.original.get(path);
			if (!before) {
				changes.push({ row, isNew: true });
				continue;
			}
			if (!differs(before, row)) continue;
			const next: NodeRow = {
				...row,
				updatedAt: this.now,
				statusSince: row.status === before.status ? before.statusSince : this.now
			};
			this.rows.set(path, next);
			changes.push({ row: next, isNew: false });
		}
		return {
			removed: [...this.removed].filter((p) => !this.rows.has(p)).sort(deepestFirst),
			changes,
			current: this.current,
			currentChanged: this.current !== this.startCurrent
		};
	}

	private set(row: NodeRow): void {
		this.rows.set(row.path, row);
		this.touched.add(row.path);
	}

	private subtree(path: string): string[] {
		const prefix = `${path}/`;
		return [...this.rows.keys()].filter((p) => p === path || p.startsWith(prefix));
	}

	private nextPosition(parentPath: string | null): number {
		let top = -1;
		for (const row of this.rows.values()) {
			if (row.parentPath === parentPath && row.position > top) top = row.position;
		}
		return top + 1;
	}

	private ensureAncestors(path: string): void {
		for (const ancestor of ancestorsOf(path).reverse()) {
			if (!this.rows.has(ancestor)) {
				this.create(ancestor, { path: ancestor, kind: 'area', status: 'open' });
			}
		}
	}

	private create(path: string, input: NodeInput): void {
		if (this.rows.size >= MAX_NODES) {
			throw new ApiError(400, `a topic holds at most ${MAX_NODES} nodes`);
		}
		const kind = input.kind!;
		this.set({
			topicId: this.topicId,
			path,
			parentPath: parentOf(path),
			key: keyOf(path),
			depth: depthOf(path),
			position: input.position ?? this.nextPosition(parentOf(path)),
			kind,
			status: input.status ?? (SETTLED_ON_CREATE.includes(kind) ? 'settled' : 'open'),
			title: input.title ?? keyOf(path),
			gist: input.gist ?? '',
			body: input.body ?? '',
			recommendation: input.recommendation ?? '',
			answer: input.answer ?? '',
			rank: input.rank ?? null,
			edges: input.edges ?? [],
			widgets: input.widgets ?? [],
			sources: input.sources ?? [],
			gistStale: false,
			createdAt: this.now,
			updatedAt: this.now,
			statusSince: this.now
		});
	}

	private update(row: NodeRow, input: NodeInput): void {
		const next: NodeRow = { ...row };
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
		this.set(next);
	}
}
