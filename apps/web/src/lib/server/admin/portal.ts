import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { RowDataPacket } from 'mysql2/promise';
import { ApiError } from '#lib/server/api.ts';
import { pool } from '#lib/server/db/index.ts';
import { journalTags, migrationsDir } from '#lib/server/admin/bundle.ts';
import { log } from '#lib/server/log.ts';
import { endStreams } from '#lib/server/stream.ts';
import pkg from '../../../../package.json' with { type: 'json' };

const COUNTED = ['projects', 'topics', 'nodes', 'notes', 'events', 'sessions', 'pairings'];

async function rows<T = RowDataPacket>(sql: string, values: unknown[] = []): Promise<T[]> {
	const [result] = await pool.query(sql, values);
	return result as T[];
}

export async function stats() {
	const [{ bytes, name }] = await rows<{ bytes: number; name: string }>(
		`SELECT COALESCE(SUM(data_length + index_length), 0) AS bytes, DATABASE() AS name
		 FROM information_schema.tables WHERE table_schema = DATABASE()`
	);
	const counts: Record<string, number> = {};
	for (const table of COUNTED) {
		const [row] = await rows<{ n: number }>(`SELECT COUNT(*) AS n FROM \`${table}\``);
		counts[table] = Number(row.n);
	}
	const journal = JSON.parse(await readFile(join(migrationsDir(), 'meta/_journal.json'), 'utf8'));
	const applied = new Set(
		(await rows<{ created_at: string }>('SELECT created_at FROM __drizzle_migrations')).map((row) =>
			Number(row.created_at)
		)
	);
	return {
		service: 'beryl',
		appVersion: pkg.version,
		build: __GIT_HASH__,
		database: { name, bytes: Number(bytes) },
		counts,
		schema: (await journalTags()).at(-1) ?? null,
		migrations: journal.entries.map((entry: { tag: string; when: number }) => ({
			tag: entry.tag,
			applied: applied.has(entry.when)
		}))
	};
}

interface TopicStat extends RowDataPacket {
	id: string;
	project_id: string;
	slug: string | null;
	title: string;
	status: string;
	updated_at: string;
	nodes: number;
	notes: number;
	events: number;
	bytes: number;
	last_event_at: string | null;
}

// `bytes` is the payload the Topic's rows hold, not on-disk size.
export async function listProjects() {
	const projectRows = await rows<{
		id: string;
		slug: string | null;
		name: string;
		created_at: string;
		last_write_at: string;
	}>('SELECT id, slug, name, created_at, last_write_at FROM projects ORDER BY last_write_at DESC');
	const topicRows = await rows<TopicStat>(
		`SELECT t.id, t.project_id, t.slug, t.title, t.status, t.updated_at,
			COALESCE(n.c, 0) AS nodes, COALESCE(m.c, 0) AS notes, COALESCE(e.c, 0) AS events,
			COALESCE(n.b, 0) + COALESCE(m.b, 0) + COALESCE(e.b, 0) AS bytes, e.last AS last_event_at
		 FROM topics t
		 LEFT JOIN (SELECT topic_id, COUNT(*) c,
				SUM(LENGTH(body) + LENGTH(gist) + LENGTH(title) + LENGTH(recommendation) + LENGTH(answer)
					+ LENGTH(CAST(widgets AS CHAR)) + LENGTH(CAST(edges AS CHAR)) + LENGTH(CAST(sources AS CHAR))) b
			FROM nodes GROUP BY topic_id) n ON n.topic_id = t.id
		 LEFT JOIN (SELECT topic_id, COUNT(*) c,
				SUM(LENGTH(text) + LENGTH(reply) + LENGTH(CAST(anchor AS CHAR))) b
			FROM notes GROUP BY topic_id) m ON m.topic_id = t.id
		 LEFT JOIN (SELECT topic_id, COUNT(*) c, SUM(LENGTH(CAST(payload AS CHAR))) b, MAX(at) last
			FROM events GROUP BY topic_id) e ON e.topic_id = t.id
		 ORDER BY t.updated_at DESC`
	);
	const iso = (value: unknown) => (value ? new Date(value as string).toISOString() : null);
	return projectRows.map((project) => {
		const topics = topicRows
			.filter((topic) => topic.project_id === project.id)
			.map((topic) => ({
				id: topic.id,
				slug: topic.slug,
				title: topic.title,
				status: topic.status,
				nodes: Number(topic.nodes),
				notes: Number(topic.notes),
				events: Number(topic.events),
				bytes: Number(topic.bytes),
				lastActivityAt: iso(topic.last_event_at ?? topic.updated_at)
			}));
		return {
			id: project.id,
			slug: project.slug,
			name: project.name,
			createdAt: iso(project.created_at),
			lastActivityAt: iso(project.last_write_at),
			bytes: topics.reduce((sum, topic) => sum + topic.bytes, 0),
			topics
		};
	});
}

function confirmed(
	given: Record<string, unknown>,
	expected: { name: string; id: string },
	what: string
): void {
	if (given.confirm !== expected.name) {
		throw new ApiError(400, `confirm must equal the ${what} exactly`);
	}
	if (given.confirmId !== expected.id) throw new ApiError(400, 'confirmId must equal the id');
}

export async function deleteProject(id: string, confirm: Record<string, unknown>) {
	const [project] = await rows<{ name: string }>('SELECT name FROM projects WHERE id = ?', [id]);
	if (!project) throw new ApiError(404, 'Project not found');
	confirmed(confirm, { name: project.name, id }, 'Project name');
	const topicIds = (
		await rows<{ id: string }>('SELECT id FROM topics WHERE project_id = ?', [id])
	).map((row) => row.id);
	await pool.query('DELETE FROM projects WHERE id = ?', [id]);
	endStreams(topicIds);
	log('admin.delete_project', { id, topics: topicIds.length });
	return { deleted: id, topics: topicIds.length };
}

export async function deleteTopic(id: string, confirm: Record<string, unknown>) {
	const [topic] = await rows<{ title: string }>('SELECT title FROM topics WHERE id = ?', [id]);
	if (!topic) throw new ApiError(404, 'Topic not found');
	confirmed(confirm, { name: topic.title, id }, 'Topic title');
	await pool.query('DELETE FROM topics WHERE id = ?', [id]);
	endStreams([id]);
	log('admin.delete_topic', { id });
	return { deleted: id };
}
