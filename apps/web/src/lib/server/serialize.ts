import type { events, nodes, notes, projects, topics } from '#lib/server/db/schema.ts';
import type {
	AgentInfo,
	Anchor,
	Edge,
	Node,
	NodeKind,
	NodeStatus,
	Note,
	NoteIntent,
	NoteStatus,
	BerylEvent,
	Project,
	Source,
	Topic,
	TopicStatus,
	Widget
} from '#lib/types.ts';

export type ProjectRow = typeof projects.$inferSelect;
export type TopicRow = typeof topics.$inferSelect;
export type NodeRow = typeof nodes.$inferSelect;
export type NoteRow = typeof notes.$inferSelect;
export type EventRow = typeof events.$inferSelect;

const iso = (date: Date) => date.toISOString();
const isoOrNull = (date: Date | null) => (date ? iso(date) : null);

export function toProject(row: ProjectRow): Project {
	return {
		id: row.id,
		name: row.name,
		createdAt: iso(row.createdAt),
		lastWriteAt: iso(row.lastWriteAt)
	};
}

export function toTopic(row: TopicRow): Topic {
	return {
		id: row.id,
		projectId: row.projectId,
		title: row.title,
		destination: row.destination,
		summary: row.summary,
		status: row.status as TopicStatus,
		current: row.current ?? null,
		agent: (row.agent as AgentInfo | null) ?? null,
		repo: row.repo ?? null,
		branch: row.branch ?? null,
		createdAt: iso(row.createdAt),
		updatedAt: iso(row.updatedAt),
		closedAt: isoOrNull(row.closedAt)
	};
}

export function toNode(row: NodeRow): Node {
	return {
		topicId: row.topicId,
		path: row.path,
		parentPath: row.parentPath ?? null,
		key: row.key,
		depth: row.depth,
		position: row.position,
		kind: row.kind as NodeKind,
		status: row.status as NodeStatus,
		title: row.title,
		gist: row.gist,
		body: row.body,
		recommendation: row.recommendation,
		answer: row.answer,
		rank: row.rank ?? null,
		edges: row.edges as Edge[],
		widgets: row.widgets as Widget[],
		sources: row.sources as Source[],
		gistStale: row.gistStale,
		createdAt: iso(row.createdAt),
		updatedAt: iso(row.updatedAt),
		statusSince: iso(row.statusSince)
	};
}

export function toNote(row: NoteRow): Note {
	return {
		id: row.id,
		topicId: row.topicId,
		anchor: row.anchor as Anchor,
		intent: row.intent as NoteIntent,
		text: row.text,
		author: row.author,
		status: row.status as NoteStatus,
		sentAt: isoOrNull(row.sentAt),
		deliveredAt: isoOrNull(row.deliveredAt),
		resolvedAt: isoOrNull(row.resolvedAt),
		reply: row.reply,
		changed: row.changed as string[],
		createdAt: iso(row.createdAt),
		updatedAt: iso(row.updatedAt)
	};
}

export function toEvent(row: EventRow): BerylEvent {
	return {
		seq: Number(row.seq),
		type: row.type as BerylEvent['type'],
		topicId: row.topicId,
		path: row.path ?? null,
		payload: row.payload as BerylEvent['payload'],
		at: iso(row.at)
	};
}
