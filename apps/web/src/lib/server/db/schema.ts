import { sql } from 'drizzle-orm';
import {
	boolean,
	char,
	index,
	int,
	json,
	mediumtext,
	mysqlTable,
	primaryKey,
	serial,
	text,
	timestamp,
	varchar
} from 'drizzle-orm/mysql-core';

const now = (name: string) =>
	timestamp(name, { fsp: 3 })
		.notNull()
		.default(sql`CURRENT_TIMESTAMP(3)`);

export const projects = mysqlTable('projects', {
	id: varchar('id', { length: 36 }).primaryKey(),
	name: varchar('name', { length: 200 }).notNull(),
	writeKeyHash: char('write_key_hash', { length: 64 }).notNull(),
	noteKeyHash: char('note_key_hash', { length: 64 }).notNull(),
	createdAt: now('created_at'),
	lastWriteAt: now('last_write_at')
});

// Paths are case-sensitive: give every path column `CHARACTER SET ascii COLLATE ascii_bin` by
// hand in its migration SQL, which drizzle cannot express.
export const topics = mysqlTable(
	'topics',
	{
		id: varchar('id', { length: 36 }).primaryKey(),
		projectId: varchar('project_id', { length: 36 })
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
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
		closedAt: timestamp('closed_at', { fsp: 3 })
	},
	(table) => [index('topics_project_updated_idx').on(table.projectId, table.updatedAt)]
);

export const nodes = mysqlTable(
	'nodes',
	{
		topicId: varchar('topic_id', { length: 36 })
			.notNull()
			.references(() => topics.id, { onDelete: 'cascade' }),
		path: varchar('path', { length: 512 }).notNull(),
		parentPath: varchar('parent_path', { length: 512 }),
		key: varchar('key', { length: 64 }).notNull(),
		depth: int('depth').notNull(),
		position: int('position').notNull(),
		kind: varchar('kind', { length: 16 }).notNull(),
		status: varchar('status', { length: 16 }).notNull(),
		title: varchar('title', { length: 120 }).notNull(),
		gist: varchar('gist', { length: 400 }).notNull(),
		body: mediumtext('body').notNull(),
		recommendation: text('recommendation').notNull(),
		answer: text('answer').notNull(),
		rank: int('rank'),
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

export const notes = mysqlTable(
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
		sentAt: timestamp('sent_at', { fsp: 3 }),
		deliveredAt: timestamp('delivered_at', { fsp: 3 }),
		resolvedAt: timestamp('resolved_at', { fsp: 3 }),
		reply: text('reply').notNull(),
		changed: json('changed').notNull(),
		createdAt: now('created_at'),
		updatedAt: now('updated_at')
	},
	(table) => [index('notes_topic_created_idx').on(table.topicId, table.createdAt)]
);

export const events = mysqlTable(
	'events',
	{
		seq: serial('seq').primaryKey(),
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
