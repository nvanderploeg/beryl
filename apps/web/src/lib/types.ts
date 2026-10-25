// The types of docs/api.md, exactly. Change that file first.

export type NodeKind =
	| 'area'
	| 'decision'
	| 'assumption'
	| 'fact'
	| 'term'
	| 'fog'
	| 'constraint'
	| 'risk';
export type NodeStatus = 'open' | 'settled' | 'parked' | 'dropped';
export type EdgeRel = 'relies_on' | 'relates' | 'conflicts' | 'supersedes';
export type TopicStatus = 'open' | 'closed';
export type NoteIntent = 'answer' | 'accept' | 'correct' | 'comment' | 'explore' | 'defer' | 'drop';
export type NoteStatus = 'queued' | 'delivered' | 'resolved';
export type WidgetType =
	| 'markdown'
	| 'code'
	| 'schema'
	| 'migration'
	| 'files'
	| 'classes'
	| 'options'
	| 'sequence'
	| 'states'
	| 'api'
	| 'table';

export const NODE_KINDS: readonly NodeKind[] = [
	'area',
	'decision',
	'assumption',
	'fact',
	'term',
	'fog',
	'constraint',
	'risk'
];
export const NODE_STATUSES: readonly NodeStatus[] = ['open', 'settled', 'parked', 'dropped'];
export const EDGE_RELS: readonly EdgeRel[] = ['relies_on', 'relates', 'conflicts', 'supersedes'];
export const NOTE_INTENTS: readonly NoteIntent[] = [
	'answer',
	'accept',
	'correct',
	'comment',
	'explore',
	'defer',
	'drop'
];
export const WIDGET_TYPES: readonly WidgetType[] = [
	'markdown',
	'code',
	'schema',
	'migration',
	'files',
	'classes',
	'options',
	'sequence',
	'states',
	'api',
	'table'
];

export interface AgentInfo {
	tool?: string;
	model?: string;
	effort?: string;
}

export interface Edge {
	rel: EdgeRel;
	to: string;
	label?: string;
}

export interface Source {
	label?: string;
	url?: string;
	file?: string;
	line?: number;
}

export interface Widget {
	key: string;
	type: WidgetType;
	title?: string;
	data: unknown;
}

export interface Project {
	id: string;
	name: string;
	createdAt: string;
	lastWriteAt: string;
}

export interface Topic {
	id: string;
	projectId: string;
	title: string;
	destination: string;
	summary: string;
	status: TopicStatus;
	current: string | null;
	agent: AgentInfo | null;
	repo: string | null;
	branch: string | null;
	createdAt: string;
	updatedAt: string;
	closedAt: string | null;
}

export interface Node {
	topicId: string;
	path: string;
	parentPath: string | null;
	key: string;
	depth: number;
	position: number;
	kind: NodeKind;
	status: NodeStatus;
	title: string;
	gist: string;
	body: string;
	recommendation: string;
	answer: string;
	rank: number | null;
	edges: Edge[];
	widgets: Widget[];
	sources: Source[];
	gistStale: boolean;
	createdAt: string;
	updatedAt: string;
	statusSince: string;
}

export interface NodeInput {
	path: string;
	kind?: NodeKind;
	status?: NodeStatus;
	title?: string;
	gist?: string;
	body?: string;
	recommendation?: string;
	answer?: string;
	rank?: number | null;
	edges?: Edge[];
	widgets?: Widget[];
	sources?: Source[];
	position?: number;
}

export interface Anchor {
	path: string | null;
	widget?: string;
	element?: string;
}

export interface Note {
	id: string;
	topicId: string;
	anchor: Anchor;
	intent: NoteIntent;
	text: string;
	author: string;
	status: NoteStatus;
	sentAt: string | null;
	deliveredAt: string | null;
	resolvedAt: string | null;
	reply: string;
	changed: string[];
	createdAt: string;
	updatedAt: string;
}

export interface Counts {
	questions: number;
	assumptions: number;
	fog: number;
	risks: number;
	settled: number;
	total: number;
}

export interface TopicSummary extends Topic {
	counts: Counts;
	queuedNotes: number;
}

export interface Snapshot {
	project: Project;
	topic: Topic;
	nodes: Node[];
	notes: Note[];
	lastSeq: number;
}

export interface Pulled {
	notes: Note[];
	unresolved: Note[];
	context: Record<string, { title: string; kind: NodeKind; status: NodeStatus }>;
	stale: { path: string; title: string }[];
}

export type PalantirEventType =
	| 'topic'
	| 'node'
	| 'node_removed'
	| 'note'
	| 'note_removed'
	| 'send';

export interface PalantirEvent {
	seq: number;
	type: PalantirEventType;
	topicId: string;
	path: string | null;
	payload:
		| Topic
		| Node
		| { path: string }
		| Note
		| { id: string }
		| { count: number; at: string };
	at: string;
}
