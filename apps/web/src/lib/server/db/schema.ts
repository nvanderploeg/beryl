import { sql } from 'drizzle-orm';
import {
	bigserial,
	boolean,
	char,
	index,
	integer,
	json,
	pgTable,
	primaryKey,
	text,
	timestamp,
	uniqueIndex,
	varchar
} from 'drizzle-orm/pg-core';

const instant = (name: string) => timestamp(name, { precision: 3, withTimezone: true });

const now = (name: string) =>
	instant(name)
		.notNull()
		.default(sql`now()`);

// `slug` is the friendly address of the row: unique across Projects, and across one Project's
// Topics. NULL only until the boot backfill assigns one.
export const projects = pgTable(
	'projects',
	{
		id: varchar('id', { length: 36 }).primaryKey(),
		slug: varchar('slug', { length: 48 }),
		name: varchar('name', { length: 200 }).notNull(),
		writeKeyHash: char('write_key_hash', { length: 64 }).notNull(),
		createdAt: now('created_at'),
		lastWriteAt: now('last_write_at')
	},
	(table) => [uniqueIndex('projects_slug_idx').on(table.slug)]
);

export const pairings = pgTable('pairings', {
	codeHash: char('code_hash', { length: 64 }).primaryKey(),
	projectId: varchar('project_id', { length: 36 })
		.notNull()
		.references(() => projects.id, { onDelete: 'cascade' }),
	expiresAt: instant('expires_at').notNull()
});

export const sessions = pgTable('sessions', {
	tokenHash: char('token_hash', { length: 64 }).primaryKey(),
	projectId: varchar('project_id', { length: 36 })
		.notNull()
		.references(() => projects.id, { onDelete: 'cascade' }),
	lastActionAt: instant('last_action_at').notNull(),
	expiresAt: instant('expires_at').notNull()
});

// Paths are case-sensitive and byte-ordered: give every path column `COLLATE "C"` by hand in its
// migration SQL, which drizzle cannot express.
export const topics = pgTable(
	'topics',
	{
		id: varchar('id', { length: 36 }).primaryKey(),
		projectId: varchar('project_id', { length: 36 })
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		slug: varchar('slug', { length: 48 }),
		title: varchar('title', { length: 200 }).notNull(),
		destination: text('destination').notNull(),
		summary: text('summary').notNull(),
		status: varchar('status', { length: 16 }).notNull(),
		current: varchar('current', { length: 512 }),
		agent: json('agent'),
		repo: varchar('repo', { length: 255 }),
		branch: varchar('branch', { length: 255 }),
		createdAt: now('created_at'),
		updatedAt: now('updated_at'),
		closedAt: instant('closed_at')
	},
	(table) => [
		index('topics_project_updated_idx').on(table.projectId, table.updatedAt),
		uniqueIndex('topics_project_slug_idx').on(table.projectId, table.slug)
	]
);

export const nodes = pgTable(
	'nodes',
	{
		topicId: varchar('topic_id', { length: 36 })
			.notNull()
			.references(() => topics.id, { onDelete: 'cascade' }),
		path: varchar('path', { length: 512 }).notNull(),
		parentPath: varchar('parent_path', { length: 512 }),
		key: varchar('key', { length: 64 }).notNull(),
		depth: integer('depth').notNull(),
		position: integer('position').notNull(),
		kind: varchar('kind', { length: 16 }).notNull(),
		status: varchar('status', { length: 16 }).notNull(),
		title: varchar('title', { length: 120 }).notNull(),
		gist: varchar('gist', { length: 400 }).notNull(),
		body: text('body').notNull(),
		recommendation: text('recommendation').notNull(),
		answer: text('answer').notNull(),
		rank: integer('rank'),
		edges: json('edges').notNull(),
		widgets: json('widgets').notNull(),
		sources: json('sources').notNull(),
		gistStale: boolean('gist_stale').notNull().default(false),
		createdAt: now('created_at'),
		updatedAt: now('updated_at'),
		statusSince: now('status_since')
	},
	(table) => [
		primaryKey({ columns: [table.topicId, table.path] }),
		index('nodes_topic_parent_idx').on(table.topicId, table.parentPath)
	]
);

export const notes = pgTable(
	'notes',
	{
		id: varchar('id', { length: 36 }).primaryKey(),
		topicId: varchar('topic_id', { length: 36 })
			.notNull()
			.references(() => topics.id, { onDelete: 'cascade' }),
		anchor: json('anchor').notNull(),
		intent: varchar('intent', { length: 16 }).notNull(),
		text: text('text').notNull(),
		author: varchar('author', { length: 64 }).notNull(),
		status: varchar('status', { length: 16 }).notNull(),
		sentAt: instant('sent_at'),
		deliveredAt: instant('delivered_at'),
		resolvedAt: instant('resolved_at'),
		reply: text('reply').notNull(),
		changed: json('changed').notNull(),
		createdAt: now('created_at'),
		updatedAt: now('updated_at')
	},
	(table) => [index('notes_topic_created_idx').on(table.topicId, table.createdAt)]
);

export const events = pgTable(
	'events',
	{
		seq: bigserial('seq', { mode: 'number' }).primaryKey(),
		topicId: varchar('topic_id', { length: 36 })
			.notNull()
			.references(() => topics.id, { onDelete: 'cascade' }),
		path: varchar('path', { length: 512 }),
		type: varchar('type', { length: 16 }).notNull(),
		payload: json('payload').notNull(),
		at: now('at')
	},
	(table) => [
		index('events_topic_seq_idx').on(table.topicId, table.seq),
		index('events_topic_path_seq_idx').on(table.topicId, table.path, table.seq)
	]
);
