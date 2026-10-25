import type {
	Counts,
	Edge,
	Node,
	NodeKind,
	Note,
	NoteIntent,
	BerylEvent,
	Project,
	Topic
} from '../types.ts';

export interface TopicState {
	project: Project;
	topic: Topic;
	nodes: Node[];
	notes: Note[];
	lastSeq: number;
}

export interface Frontier {
	current: Node | null;
	ready: Node[];
	leaning: { node: Node; waitingOn: string[] }[];
	assumptions: Node[];
	fog: Node[];
	risks: Node[];
}

export interface QuestionGroup {
	key: 'current' | 'ready' | 'leaning' | 'open' | 'parked' | 'settled' | 'dropped';
	label: string;
	nodes: Node[];
}

export type Lod = 'far' | 'mid' | 'near';
export const LOD_MID = 0.5;
export const LOD_NEAR = 1.0;

const UNKNOWN_KINDS: readonly NodeKind[] = ['decision', 'assumption', 'fog', 'risk'];
const ANSWERING_INTENTS: readonly NoteIntent[] = ['answer', 'accept', 'defer', 'drop'];

export function byTree(a: Node, b: Node): number {
	return a.depth - b.depth || a.position - b.position || compare(a.path, b.path);
}

function compare(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0;
}

function byCreated(a: Note, b: Note): number {
	return compare(a.createdAt, b.createdAt) || compare(a.id, b.id);
}

function byRank(a: Node, b: Node): number {
	if (a.rank !== null && b.rank !== null && a.rank !== b.rank) return a.rank - b.rank;
	if (a.rank !== null && b.rank === null) return -1;
	if (a.rank === null && b.rank !== null) return 1;
	return byTree(a, b);
}

function time(iso: string): number {
	const t = Date.parse(iso);
	return Number.isNaN(t) ? 0 : t;
}

function isInside(path: string, ancestor: string): boolean {
	return path.startsWith(`${ancestor}/`);
}

export function applyEvent(state: TopicState, event: BerylEvent): TopicState {
	if (event.seq <= state.lastSeq) return state;
	const next: TopicState = { ...state, lastSeq: event.seq };
	switch (event.type) {
		case 'topic':
			next.topic = event.payload as Topic;
			break;
		case 'node': {
			const node = event.payload as Node;
			next.nodes = [...state.nodes.filter((n) => n.path !== node.path), node].sort(byTree);
			break;
		}
		case 'node_removed': {
			const { path } = event.payload as { path: string };
			next.nodes = state.nodes.filter((n) => n.path !== path);
			break;
		}
		case 'note': {
			const note = event.payload as Note;
			next.notes = [...state.notes.filter((n) => n.id !== note.id), note].sort(byCreated);
			break;
		}
		case 'note_removed': {
			const { id } = event.payload as { id: string };
			next.notes = state.notes.filter((n) => n.id !== id);
			break;
		}
		case 'send':
			break;
	}
	return next;
}

export function nodeAt(nodes: Node[], path: string): Node | undefined {
	return nodes.find((n) => n.path === path);
}

export function childrenOf(nodes: Node[], parentPath: string | null): Node[] {
	return nodes
		.filter((n) => n.parentPath === parentPath)
		.sort((a, b) => a.position - b.position || compare(a.path, b.path));
}

export function descendantsOf(nodes: Node[], path: string): Node[] {
	return nodes.filter((n) => isInside(n.path, path)).sort(byTree);
}

export function ancestorsOf(path: string): string[] {
	const parts = path.split('/');
	return parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join('/'));
}

export function isUnknown(node: Node): boolean {
	return node.status === 'open' && UNKNOWN_KINDS.includes(node.kind);
}

export function countsOf(nodes: Node[], path?: string | null): Counts {
	const scope =
		path === undefined || path === null
			? nodes
			: nodes.filter((n) => n.path === path || isInside(n.path, path));
	const counts: Counts = { questions: 0, assumptions: 0, fog: 0, risks: 0, settled: 0, total: 0 };
	for (const n of scope) {
		if (n.kind === 'area') continue;
		counts.total++;
		if (n.status === 'settled') counts.settled++;
		if (n.status !== 'open') continue;
		if (n.kind === 'decision') counts.questions++;
		if (n.kind === 'assumption') counts.assumptions++;
		if (n.kind === 'fog') counts.fog++;
		if (n.kind === 'risk') counts.risks++;
	}
	return counts;
}

export function progressOf(nodes: Node[]): { settled: number; total: number } {
	const decisions = nodes.filter((n) => n.kind === 'decision' && n.status !== 'dropped');
	return {
		settled: decisions.filter((n) => n.status === 'settled').length,
		total: decisions.length
	};
}

function waitingOn(nodes: Node[], node: Node): string[] {
	return node.edges
		.filter((e) => e.rel === 'relies_on')
		.map((e) => e.to)
		.filter((to) => nodeAt(nodes, to)?.status !== 'settled');
}

export function frontier(nodes: Node[], current: string | null): Frontier {
	const currentNode = current === null ? undefined : nodeAt(nodes, current);
	const now = currentNode?.status === 'open' ? currentNode : null;
	const open = nodes.filter((n) => n.status === 'open');
	const ready: Node[] = [];
	const leaning: { node: Node; waitingOn: string[] }[] = [];
	for (const node of open.filter((n) => n.kind === 'decision' && n !== now).sort(byRank)) {
		const waits = waitingOn(nodes, node);
		if (waits.length === 0) ready.push(node);
		else leaning.push({ node, waitingOn: waits });
	}
	const ofKind = (kind: NodeKind) => open.filter((n) => n.kind === kind).sort(byTree);
	return {
		current: now,
		ready,
		leaning,
		assumptions: ofKind('assumption'),
		fog: ofKind('fog'),
		risks: ofKind('risk')
	};
}

export function questionList(
	nodes: Node[],
	current: string | null,
	include: NodeKind[] = []
): QuestionGroup[] {
	const f = frontier(nodes, current);
	const extra = new Set<NodeKind>(include.filter((k) => k !== 'decision'));
	const listed = (n: Node) => n.kind === 'decision' || extra.has(n.kind);
	const withStatus = (status: Node['status']) =>
		nodes.filter((n) => n.status === status && listed(n)).sort(byTree);
	const groups: QuestionGroup[] = [
		{ key: 'current', label: 'Now asking', nodes: f.current ? [f.current] : [] },
		{ key: 'ready', label: 'Ready', nodes: f.ready },
		{ key: 'leaning', label: 'Waiting', nodes: f.leaning.map((l) => l.node) },
		{
			key: 'open',
			label: 'Open',
			nodes: nodes
				.filter((n) => n.status === 'open' && extra.has(n.kind) && n !== f.current)
				.sort(byTree)
		},
		{ key: 'parked', label: 'Parked', nodes: withStatus('parked') },
		{
			key: 'settled',
			label: 'Settled',
			nodes: nodes
				.filter((n) => n.status === 'settled' && listed(n))
				.sort((a, b) => time(b.statusSince) - time(a.statusSince) || compare(a.path, b.path))
		},
		{ key: 'dropped', label: 'Dropped', nodes: withStatus('dropped') }
	];
	return groups.filter((g) => g.nodes.length > 0);
}

export function lodFor(zoom: number): Lod {
	if (zoom < LOD_MID) return 'far';
	if (zoom < LOD_NEAR) return 'mid';
	return 'near';
}

export function notesOn(
	notes: Note[],
	path: string | null,
	options: { subtree?: boolean; nodes?: Node[] } = {}
): Note[] {
	let matches: (note: Note) => boolean = (note) => note.anchor.path === path;
	if (options.subtree) {
		if (path === null) {
			matches = () => true;
		} else {
			const inside = new Set(descendantsOf(options.nodes ?? [], path).map((n) => n.path));
			matches = (note) =>
				note.anchor.path === path || (note.anchor.path !== null && inside.has(note.anchor.path));
		}
	}
	return notes.filter(matches).sort(byCreated);
}

export function marksOf(notes: Note[], path: string, widget: string): Record<string, number> {
	const marks: Record<string, number> = {};
	for (const note of notes) {
		const { anchor } = note;
		if (note.status === 'resolved' || anchor.path !== path || anchor.widget !== widget) continue;
		if (anchor.element === undefined) continue;
		marks[anchor.element] = (marks[anchor.element] ?? 0) + 1;
	}
	return marks;
}

export function pendingAnswer(notes: Note[], path: string): Note | undefined {
	return notes
		.filter(
			(n) =>
				n.anchor.path === path &&
				n.anchor.widget === undefined &&
				n.status !== 'resolved' &&
				ANSWERING_INTENTS.includes(n.intent)
		)
		.sort(byCreated)
		.at(-1);
}

export function queuedCount(notes: Note[]): number {
	return notes.filter((n) => n.status === 'queued').length;
}

export function freshSince(nodes: Node[], since: string | null): Set<string> {
	if (since === null) return new Set();
	const after = time(since);
	return new Set(nodes.filter((n) => time(n.updatedAt) > after).map((n) => n.path));
}

export function defaultIntent(node: Node | null): NoteIntent {
	if (!node) return 'comment';
	if (node.kind === 'decision' && node.status === 'open') return 'answer';
	if (node.kind === 'assumption' && node.status === 'open') return 'accept';
	if (node.kind === 'fog') return 'explore';
	return 'comment';
}

export function incomingEdges(nodes: Node[], path: string): { from: string; edge: Edge }[] {
	return [...nodes]
		.sort(byTree)
		.filter((n) => n.path !== path)
		.flatMap((n) => n.edges.filter((e) => e.to === path).map((edge) => ({ from: n.path, edge })));
}
