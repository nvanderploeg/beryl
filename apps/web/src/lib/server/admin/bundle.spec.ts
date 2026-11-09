import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '#lib/server/db/index.ts';
import { randomBytes } from 'node:crypto';
import { ApiError } from '#lib/server/api.ts';
import { hashKey } from '#lib/server/hash.ts';
import { endStreams, createTopicStream } from '#lib/server/stream.ts';
import { resetDb } from '#lib/server/test/db.ts';
import { api, event, seedProject, seedTopic } from '#lib/server/test/http.ts';
import { GET as statsRoute } from '../../../routes/api/admin/stats/+server.ts';
import { GET as listRoute } from '../../../routes/api/admin/projects/+server.ts';
import { DELETE as deleteTopicRoute } from '../../../routes/api/admin/topics/[id]/+server.ts';
import { DELETE as deleteProjectRoute } from '../../../routes/api/admin/projects/[id]/+server.ts';
import { GET as exportRoute } from '../../../routes/api/admin/export/+server.ts';
import { POST as importRoute } from '../../../routes/api/admin/import/+server.ts';
import { deleteProject, deleteTopic, listProjects, stats } from './portal.ts';
import {
	DB_FILE,
	exportBundle,
	importBundle,
	journalTags,
	MANIFEST_FILE,
	verifyBundle,
	type Manifest
} from './bundle.ts';
import { readDirectory, readEntry, writeZip } from './zip.ts';

let dir: string;
beforeEach(async () => {
	await resetDb();
	dir = await mkdtemp(join(tmpdir(), 'bundlespec-'));
});
afterEach(() => rm(dir, { recursive: true, force: true }));

async function exportTo(name = 'out.zip'): Promise<string> {
	const path = join(dir, name);
	await pipeline(Readable.from(exportBundle()), createWriteStream(path));
	return path;
}

async function unpack(path: string): Promise<{ manifest: Manifest; db: string }> {
	const entries = await readDirectory(path, {
		maxEntries: 8,
		maxEntryBytes: 1 << 28,
		maxTotalBytes: 1 << 28
	});
	const text = async (name: string) => {
		const parts: Buffer[] = [];
		for await (const chunk of readEntry(
			path,
			entries.find((e) => e.name === name)!
		)) {
			parts.push(chunk);
		}
		return Buffer.concat(parts).toString('utf8');
	};
	return { manifest: JSON.parse(await text(MANIFEST_FILE)), db: await text(DB_FILE) };
}

async function repack(
	name: string,
	files: Record<string, string>,
	manifest?: (m: Manifest) => Manifest | Record<string, unknown>
): Promise<string> {
	const sha = (s: string) => createHash('sha256').update(s).digest('hex');
	const base: Manifest = {
		format: 1,
		service: 'beryl',
		appVersion: '0.0.0',
		schema: (await journalTags()).at(-1)!,
		createdAt: new Date().toISOString(),
		files: Object.entries(files).map(([path, data]) => ({
			path,
			size: Buffer.byteLength(data),
			sha256: sha(data)
		}))
	};
	const all = { ...files, [MANIFEST_FILE]: JSON.stringify(manifest ? manifest(base) : base) };
	async function* entries() {
		for (const [entry, data] of Object.entries(all)) {
			yield {
				name: entry,
				data: (async function* () {
					yield Buffer.from(data);
				})()
			};
		}
	}
	const path = join(dir, name);
	await pipeline(Readable.from(writeZip(entries())), createWriteStream(path));
	return path;
}

async function seed() {
	const project = await seedProject('Round trip');
	const { topicId } = await seedTopic(project, { title: 'Spec topic' });
	await api.putNodes(
		topicId,
		{
			nodes: [
				{
					path: 'storage',
					kind: 'decision',
					title: 'Storage',
					body: 'Unicode ✓ \\ " ok',
					widgets: [{ key: 'w', type: 'markdown', data: { text: 'hi' } }]
				}
			]
		},
		project.writeKey
	);
	await api.addNote(
		topicId,
		{ anchor: { kind: 'node', path: 'storage' }, intent: 'comment', text: 'a note' },
		project.noteKey
	);
	return { project, topicId };
}

const asAdmin = <T extends object>(e: T) =>
	({ ...e, locals: { admin: { via: 'bearer', csrf: '' } } }) as never;

async function emptyTail(): Promise<string> {
	const { db } = await unpack(await exportTo('tail.zip'));
	return `${db
		.split('\n')
		.filter((line) => line.startsWith('{') && !line.includes('"table":"projects"'))
		.join('\n')}\n`;
}

const nextSeq = async () =>
	(await pool.query("SELECT nextval('beryl_events_seq_seq')::int AS n")).rows[0].n as number;

const rejected = (work: Promise<unknown>, status: number, message: RegExp) =>
	expect(work).rejects.toMatchObject({ status, message: expect.stringMatching(message) });

describe('export', () => {
	it('writes a manifest in the shared shape, listing db with a true size and hash', async () => {
		await seed();
		const { manifest, db } = await unpack(await exportTo());
		expect(Object.keys(manifest).sort()).toEqual(
			['appVersion', 'createdAt', 'files', 'format', 'schema', 'service'].sort()
		);
		expect(manifest.format).toBe(1);
		expect(manifest.service).toBe('beryl');
		expect(manifest.schema).toBe((await journalTags()).at(-1));
		expect(manifest.files).toEqual([
			{
				path: DB_FILE,
				size: Buffer.byteLength(db),
				sha256: createHash('sha256').update(db).digest('hex')
			}
		]);
	});

	it('leaves Sessions and Pairing codes out', async () => {
		const project = await seedProject();
		await api.createPairing(project.id, project.writeKey);
		const { db } = await unpack(await exportTo());
		expect(db).not.toMatch(/"table":"(sessions|pairings)"/);
	});
});

describe('import', () => {
	it('restores everything, byte for byte, and keeps Write keys working', async () => {
		const { project, topicId } = await seed();
		const first = await exportTo('a.zip');
		await resetDb();
		expect((await api.getProject(project.id)).status).toBe(404);

		const result = await importBundle(first, { backupDir: dir });
		expect(result.rows.projects).toBe(1);
		expect(result.rows.nodes).toBeGreaterThan(0);
		expect((await api.getProject(project.id)).status).toBe(200);
		expect(
			(await api.getTopic(topicId)).body.nodes.find((n: any) => n.path === 'storage').body
		).toBe('Unicode ✓ \\ " ok');
		const added = await api.addNote(
			topicId,
			{ anchor: { kind: 'topic' }, intent: 'comment', text: 'after import' },
			project.writeKey
		);
		expect(added.status).toBe(201);

		await resetDb();
		await importBundle(first, { backupDir: dir });
		expect((await unpack(await exportTo('b.zip'))).db).toBe((await unpack(first)).db);
	});

	it('replaces what is there, drops Sessions, and backs the old state up first', async () => {
		const before = await seedProject('Before');
		const kept = await seed();
		const bundle = await exportTo();
		const extra = await seedProject('Extra');
		await api.createPairing(extra.id, extra.writeKey);

		const result = await importBundle(bundle, { backupDir: dir });
		expect((await api.getProject(extra.id)).status).toBe(404);
		expect((await api.getProject(kept.project.id)).status).toBe(200);
		expect((await api.getProject(before.id)).status).toBe(200);
		expect((await api.refresh(extra.noteKey)).status).toBe(401);
		expect((await stats()).counts.sessions).toBe(0);

		const backup = await unpack(result.backup);
		expect(backup.db).toContain(extra.id);
		expect(await readdir(dir)).toContain(result.backup.split('/').at(-1));
	});

	it('leaves the database untouched when the bundle fails validation', async () => {
		const { project } = await seed();
		const good = await exportTo();
		const { db } = await unpack(good);
		const tampered = await repack('t.zip', { [DB_FILE]: db }, (m) => ({
			...m,
			files: [{ ...m.files[0], sha256: '0'.repeat(64) }]
		}));
		await rejected(importBundle(tampered, { backupDir: dir }), 422, /checksum/);
		expect((await api.getProject(project.id)).status).toBe(200);
	});

	it('refuses a tampered database file even when the manifest still lists the old hash', async () => {
		await seed();
		const { db, manifest } = await unpack(await exportTo());
		const forged = await repack(
			'f.zip',
			{ [DB_FILE]: db.replace('Round trip', 'Round trap') },
			() => manifest
		);
		await rejected(verifyBundle(forged), 422, /size|checksum/);
	});

	it('refuses a bundle from a newer schema than this build', async () => {
		const { db } = await unpack(await exportTo());
		const newer = await repack('n.zip', { [DB_FILE]: db }, (m) => ({
			...m,
			schema: '9999_from_the_future'
		}));
		await rejected(importBundle(newer, { backupDir: dir }), 409, /newer than this build/);
	});

	it('refuses wrong format, wrong service and unlisted or extra files', async () => {
		const { db } = await unpack(await exportTo());
		await rejected(
			verifyBundle(await repack('f.zip', { [DB_FILE]: db }, (m) => ({ ...m, format: 2 }))),
			422,
			/format/
		);
		await rejected(
			verifyBundle(await repack('s.zip', { [DB_FILE]: db }, (m) => ({ ...m, service: 'sagas' }))),
			422,
			/not beryl/
		);
		await rejected(
			verifyBundle(
				await repack('x.zip', { [DB_FILE]: db, 'extra.txt': 'x' }, (m) => ({
					...m,
					files: m.files.slice(0, 1)
				}))
			),
			422,
			/unlisted/
		);
		await rejected(verifyBundle(await repack('e.zip', { 'other.bin': 'x' })), 422, /holds db/);
	});

	it('refuses zip-slip names in the zip and in the manifest', async () => {
		const { db } = await unpack(await exportTo());
		await rejected(
			verifyBundle(await repack('z.zip', { '../db.ndjson': db })),
			422,
			/unsafe entry name/
		);
		await rejected(
			verifyBundle(
				await repack('m.zip', { [DB_FILE]: db }, (m) => ({
					...m,
					files: [{ ...m.files[0], path: '../../etc/passwd' }]
				}))
			),
			422,
			/unsafe entry name/
		);
	});

	it('refuses absurd sizes', async () => {
		const { db } = await unpack(await exportTo());
		const path = await repack('big.zip', { [DB_FILE]: db });
		await rejected(verifyBundle(path, 10), 422, /too large|unpacks too large/);
	});

	it('refuses a file that is not a zip', async () => {
		const path = join(dir, 'junk.zip');
		await writeFile(path, 'hello');
		await rejected(verifyBundle(path), 422, /not a zip/);
	});

	it('rolls the whole swap back when a row is bad', async () => {
		const { project } = await seed();
		const header = JSON.stringify({ table: 'projects', columns: ['id', 'name', 'write_key_hash'] });
		const bad = await repack('bad.zip', {
			[DB_FILE]: `${header}\n["not-unique","a","${'a'.repeat(64)}"]\n["not-unique","b","${'b'.repeat(64)}"]\n`
		});
		await expect(importBundle(bad, { backupDir: dir })).rejects.toThrow();
		expect((await api.getProject(project.id)).status).toBe(200);
	});

	it('imports a bundle from an older schema, filling columns it lacks', async () => {
		const id = '11111111-1111-4111-8111-111111111111';
		const header = JSON.stringify({
			table: 'projects',
			columns: ['id', 'name', 'write_key_hash', 'created_at', 'last_write_at']
		});
		const old = await repack(
			'old.zip',
			{
				[DB_FILE]: `${header}\n${JSON.stringify([id, 'Old Project', 'c'.repeat(64), '2026-01-01 00:00:00.000', '2026-01-02 00:00:00.000'])}\n${await emptyTail()}`
			},
			(m) => ({ ...m, schema: '0001_pairing_sessions' })
		);
		await importBundle(old, { backupDir: dir });
		expect((await api.getProject(id)).status).toBe(200);
		expect((await listProjects())[0].slug).toBe('old-project');
	});

	it('leaves the event sequence where it is when it is already past the Bundle', async () => {
		await seed();
		const bundle = await exportTo('seq.zip');
		await pool.query("SELECT setval('beryl_events_seq_seq', 1000000)");
		await importBundle(bundle, { backupDir: dir });
		expect(await nextSeq()).toBe(1000001);
	});

	it('imports a Bundle exported by the MySQL build and keeps allocating event seqs after it', async () => {
		const legacyKey = 'bk_legacy';
		const pid = '33333333-3333-4333-8333-333333333333';
		const tid = '44444444-4444-4444-8444-444444444444';
		const at = '2026-03-04 05:06:07.089';
		const table = (name: string, columns: string[], rows: unknown[][]) =>
			[JSON.stringify({ table: name, columns }), ...rows.map((row) => JSON.stringify(row))].join(
				'\n'
			);
		const widgets = '[{"key": "w", "type": "markdown", "data": {"text": "hi"}}]';
		const dump = [
			table(
				'projects',
				['id', 'slug', 'name', 'write_key_hash', 'created_at', 'last_write_at'],
				[[pid, 'legacy', 'Legacy', hashKey(legacyKey), at, at]]
			),
			table(
				'topics',
				[
					'id',
					'project_id',
					'slug',
					'title',
					'destination',
					'summary',
					'status',
					'current',
					'agent',
					'repo',
					'branch',
					'created_at',
					'updated_at',
					'closed_at'
				],
				[
					[
						tid,
						pid,
						'legacy-topic',
						'Legacy topic',
						'',
						'',
						'open',
						null,
						'{"name": "claude"}',
						null,
						null,
						at,
						at,
						null
					]
				]
			),
			table(
				'nodes',
				[
					'topic_id',
					'path',
					'parent_path',
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
					'edges',
					'widgets',
					'sources',
					'gist_stale',
					'created_at',
					'updated_at',
					'status_since'
				],
				[
					[
						tid,
						'Storage',
						null,
						'Storage',
						1,
						0,
						'decision',
						'open',
						'Storage',
						'',
						'',
						'',
						'',
						null,
						'[]',
						widgets,
						'[]',
						1,
						at,
						at,
						at
					]
				]
			),
			table(
				'notes',
				[
					'id',
					'topic_id',
					'anchor',
					'intent',
					'text',
					'author',
					'status',
					'sent_at',
					'delivered_at',
					'resolved_at',
					'reply',
					'changed',
					'created_at',
					'updated_at'
				],
				[]
			),
			table(
				'events',
				['seq', 'topic_id', 'path', 'type', 'payload', 'at'],
				[
					[41, tid, null, 'topic', '{"title": "Legacy topic"}', at],
					[42, tid, 'Storage', 'node', '{"path": "Storage"}', at]
				]
			)
		].join('\n');
		const bundle = await repack('mysql-era.zip', { [DB_FILE]: `${dump}\n` }, (m) => ({
			...m,
			schema: '0002_project_topic_slugs'
		}));
		await pool.query('ALTER SEQUENCE beryl_events_seq_seq RESTART WITH 1');
		await importBundle(bundle, { backupDir: dir });
		expect(await nextSeq()).toBe(43);

		const topic = await api.getTopic(tid);
		expect(topic.status).toBe(200);
		expect(topic.body.lastSeq).toBe(42);
		expect(topic.body.nodes[0]).toMatchObject({ path: 'Storage', gistStale: true });
		const { rows } = await pool.query(
			'SELECT EXTRACT(EPOCH FROM created_at)::float8 AS u, widgets::text AS w FROM beryl_nodes'
		);
		expect(rows[0].u).toBe(Date.UTC(2026, 2, 4, 5, 6, 7, 89) / 1000);
		expect(rows[0].w).toBe(widgets);

		const { db } = await unpack(await exportTo('mysql-era-out.zip'));
		expect(db).toContain(JSON.stringify([41, tid, null, 'topic', '{"title": "Legacy topic"}', at]));
		expect(db).toContain(
			JSON.stringify([
				tid,
				'Storage',
				null,
				'Storage',
				1,
				0,
				'decision',
				'open',
				'Storage',
				'',
				'',
				'',
				'',
				null,
				'[]',
				widgets,
				'[]',
				1,
				at,
				at,
				at
			])
		);

		const written = await api.putNodes(
			tid,
			{ nodes: [{ path: 'Other', kind: 'fact', title: 'Other' }] },
			legacyKey
		);
		expect(written.status).toBe(200);
		expect((await api.getTopic(tid)).body.lastSeq).toBeGreaterThan(42);
	});

	it('rejects a NUL character in a text column with a 422 naming table and column', async () => {
		await seed();
		const header = JSON.stringify({ table: 'projects', columns: ['id', 'name', 'write_key_hash'] });
		const bad = await repack('nul.zip', {
			[DB_FILE]: `${header}\n${JSON.stringify(['11111111-1111-4111-8111-111111111111', 'a\u0000b', 'a'.repeat(64)])}\n${await emptyTail()}`
		});
		await rejected(importBundle(bad, { backupDir: dir }), 422, /projects\.name contains a NUL/);
	});

	it('refuses an older bundle that lacks a column with no default', async () => {
		const header = JSON.stringify({ table: 'projects', columns: ['id'] });
		const old = await repack('nodef.zip', {
			[DB_FILE]: `${header}\n["11111111-1111-4111-8111-111111111111"]\n`
		});
		await rejected(importBundle(old, { backupDir: dir }), 422, /projects\.name/);
	});

	it('refuses a bundle with a missing table or no Projects unless allowEmpty is set', async () => {
		const seeded = await seed();
		const tail = await emptyTail();
		const projectsHeader = (await unpack(await exportTo('p.zip'))).db.split('\n')[0];
		const partial = await repack('partial.zip', { [DB_FILE]: `${projectsHeader}\n` });
		await rejected(importBundle(partial, { backupDir: dir }), 422, /no data for/);

		const empty = await repack('empty.zip', { [DB_FILE]: `${projectsHeader}\n${tail}` });
		await rejected(importBundle(empty, { backupDir: dir }), 409, /no Projects/);
		expect((await api.getProject(seeded.project.id)).status).toBe(200);

		await importBundle(empty, { backupDir: dir, allowEmpty: true });
		expect((await api.getProject(seeded.project.id)).status).toBe(404);
	});

	it('ends open streams with a reset so boards reload', async () => {
		const { topicId } = await seed();
		const bundle = await exportTo();
		const stream = (await createTopicStream(topicId, { since: 0 }))!;
		const reader = stream.getReader();
		const chunks: string[] = [];
		const done = (async () => {
			for (;;) {
				const { value, done: finished } = await reader.read();
				if (finished) return;
				chunks.push(new TextDecoder().decode(value));
			}
		})();
		await importBundle(bundle, { backupDir: dir });
		await done;
		expect(chunks.join('')).toContain('event: reset');
		endStreams();
	});

	it('serves one import at a time', async () => {
		await seed();
		const bundle = await exportTo();
		const results = await Promise.allSettled([
			importBundle(bundle, { backupDir: dir }),
			importBundle(bundle, { backupDir: dir })
		]);
		expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
		const failure = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
		expect(failure.reason).toBeInstanceOf(ApiError);
	});
});

describe('routes', () => {
	it('every admin handler refuses a request the gate never vetted', async () => {
		const { project, topicId } = await seed();
		const bare = (method: string, path: string, params = {}) => event({ method, path, params });
		const answers = await Promise.all([
			statsRoute(bare('GET', '/api/admin/stats')),
			listRoute(bare('GET', '/api/admin/projects')),
			exportRoute(bare('GET', '/api/admin/export')),
			importRoute(bare('POST', '/api/admin/import?confirm=replace-everything')),
			deleteProjectRoute(bare('DELETE', '/x', { id: project.id })),
			deleteTopicRoute(bare('DELETE', '/x', { id: topicId }))
		]);
		expect(answers.map((r) => r.status)).toEqual([404, 404, 404, 404, 404, 404]);
		expect((await api.getProject(project.id)).status).toBe(200);
	});

	it('streams a bundle from GET and takes it back on POST only with the confirmation', async () => {
		const { project } = await seed();
		const res = await exportRoute(asAdmin(event({ path: '/api/admin/export' })));
		expect(res.headers.get('content-type')).toBe('application/zip');
		const bytes = Buffer.from(await res.arrayBuffer());
		await resetDb();

		const post = (query: string) =>
			importRoute({
				...event({ method: 'POST', path: `/api/admin/import${query}` }),
				locals: { admin: { via: 'bearer', csrf: '' } },
				request: new Request(`http://beryl.test/api/admin/import${query}`, {
					method: 'POST',
					body: bytes,
					headers: { 'content-type': 'application/zip' }
				}),
				url: new URL(`http://beryl.test/api/admin/import${query}`)
			} as never);
		expect((await post('')).status).toBe(400);
		expect((await api.getProject(project.id)).status).toBe(404);
		const ok = await post('?confirm=replace-everything');
		expect(ok.status).toBe(200);
		expect((await api.getProject(project.id)).status).toBe(200);
		expect(await readFile((await ok.json()).backup)).toBeTruthy();
	});
});

describe('portal', () => {
	it('reports health, and lists Projects with Topics, sizes and activity', async () => {
		const { project, topicId } = await seed();
		const report = await stats();
		expect(report.counts.projects).toBe(1);
		expect(report.database.bytes).toBeGreaterThan(0);
		expect(report.migrations.every((m: { applied: boolean }) => m.applied)).toBe(true);
		const [listed] = await listProjects();
		expect(listed.id).toBe(project.id);
		expect(listed.topics[0]).toMatchObject({ id: topicId, nodes: 1, notes: 1 });
		expect(listed.topics[0].bytes).toBeGreaterThan(0);
		expect(listed.topics[0].lastActivityAt).toBeTruthy();
	});

	it('deletes only on an exact typed name', async () => {
		const { project, topicId } = await seed();
		await rejected(
			deleteTopic(topicId, { confirm: 'spec topic', confirmId: topicId }),
			400,
			/confirm/
		);
		await rejected(
			deleteProject(project.id, { confirm: 'nope', confirmId: project.id }),
			400,
			/confirm/
		);
		await rejected(deleteTopic(topicId, { confirm: 'Spec topic' }), 400, /confirmId/);
		expect((await api.getTopic(topicId)).status).toBe(200);
		await deleteTopic(topicId, { confirm: 'Spec topic', confirmId: topicId });
		expect((await api.getTopic(topicId)).status).toBe(404);
		const res = await deleteProjectRoute(
			asAdmin(
				event({
					method: 'DELETE',
					path: '/x',
					params: { id: project.id },
					body: { confirm: 'Round trip', confirmId: project.id }
				})
			)
		);
		expect(res.status).toBe(200);
		expect((await api.getProject(project.id)).status).toBe(404);
	});

	it('releases its connection when an export is abandoned mid-stream, however often', async () => {
		const { topicId } = await seed();
		const filler = Array.from({ length: 3000 }, (_, i) => [
			topicId,
			`bulk/${i}`,
			'bulk',
			`k${i}`,
			2,
			i,
			'fact',
			'open',
			'bulk',
			'',
			randomBytes(8000).toString('hex'),
			'',
			'',
			'[]',
			'[]',
			'[]'
		]);
		const columns =
			'topic_id, path, parent_path, "key", depth, position, kind, status, title, gist, body, recommendation, answer, edges, widgets, sources';
		for (let at = 0; at < filler.length; at += 300) {
			const batch = filler.slice(at, at + 300);
			const tuples = batch.map(
				(row, r) => `(${row.map((_, c) => `$${r * row.length + c + 1}`).join(', ')})`
			);
			await pool.query(
				`INSERT INTO beryl_nodes (${columns}) VALUES ${tuples.join(', ')}`,
				batch.flat()
			);
		}

		for (let i = 0; i < 15; i++) {
			const abandoned = exportBundle();
			for (let chunks = 0; chunks < 3; chunks++) await abandoned.next();
			await abandoned.return(undefined);
		}

		const timeout = new Promise((_, reject) =>
			setTimeout(() => reject(new Error('pool exhausted by abandoned exports')), 5000)
		);
		const held = await Promise.race([
			Promise.all(Array.from({ length: 10 }, () => pool.connect())),
			timeout
		]);
		(held as { release: () => void }[]).forEach((c) => c.release());
		await exportTo();
	});

	it('dumps and loads timestamps as UTC whatever the pooled sessions use', async () => {
		const setZone = async (zone: string) => {
			const held = await Promise.all(Array.from({ length: 10 }, () => pool.connect()));
			for (const c of held) await c.query(`SET TIME ZONE '${zone}'`);
			held.forEach((c) => c.release());
		};
		const tamper = async (zone: string) => {
			await setZone(zone);
			return () => setZone('UTC');
		};
		const id = '22222222-2222-4222-8222-222222222222';
		const header = JSON.stringify({
			table: 'projects',
			columns: ['id', 'name', 'write_key_hash', 'created_at', 'last_write_at']
		});
		const bundle = await repack('tz.zip', {
			[DB_FILE]: `${header}\n${JSON.stringify([id, 'Zoned', 'd'.repeat(64), '2026-01-01 12:00:00.000', '2026-01-01 12:00:00.000'])}\n${await emptyTail()}`
		});

		let restore = await tamper('+05:00');
		try {
			await importBundle(bundle, { backupDir: dir });
		} finally {
			await restore();
		}
		const { rows } = await pool.query(
			'SELECT EXTRACT(EPOCH FROM created_at)::int AS u FROM beryl_projects'
		);
		expect(rows[0].u).toBe(Date.UTC(2026, 0, 1, 12) / 1000);

		restore = await tamper('-08:00');
		try {
			expect((await unpack(await exportTo('tz2.zip'))).db).toContain('2026-01-01 12:00:00.000');
		} finally {
			await restore();
		}
	});

	it('rejects a database line that is not a header or a row', async () => {
		await seed();
		for (const line of ['null', '7', '"text"']) {
			const bad = await repack('line.zip', { [DB_FILE]: `${line}\n` });
			await rejected(importBundle(bad, { backupDir: dir }), 422, /neither a header nor a row/);
		}
	});
});
