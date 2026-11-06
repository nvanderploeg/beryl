import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { getTableConfig, type MySqlTable } from 'drizzle-orm/mysql-core';
import type { PoolConnection } from 'mysql2/promise';
import { ADMIN_BACKUP_DIR, ADMIN_MAX_UNPACKED_MB } from '$app/env/private';
import { ApiError } from '#lib/server/api.ts';
import { pool } from '#lib/server/db/index.ts';
import { events, nodes, notes, projects, topics } from '#lib/server/db/schema.ts';
import { log } from '#lib/server/log.ts';
import { endStreams } from '#lib/server/stream.ts';
import { backfillSlugs } from '#lib/server/store.ts';
import {
	checkEntryName,
	readDirectory,
	readEntry,
	writeZip,
	ZipError,
	type ZipEntry,
	type ZipSource
} from '#lib/server/admin/zip.ts';
import pkg from '../../../../package.json' with { type: 'json' };

export const FORMAT = 1;
export const SERVICE = 'beryl';
export const DB_FILE = 'db.ndjson';
export const MANIFEST_FILE = 'manifest.json';
const BACKUPS_KEPT = 5;
const MAX_LINE_BYTES = 40 << 20;
const MAX_MANIFEST_BYTES = 1 << 20;
const BATCH_ROWS = 500;

// Parents before children. Pairing codes and Sessions are deliberately absent: they are
// short-lived browser credentials, and a restored host starts with none.
export const BUNDLE_TABLES: Record<string, MySqlTable> = {
	projects,
	topics,
	nodes,
	notes,
	events
};
const WIPE_ORDER = ['events', 'notes', 'nodes', 'topics', 'sessions', 'pairings', 'projects'];

export interface Manifest {
	format: number;
	service: string;
	appVersion: string;
	schema: string;
	createdAt: string;
	files: { path: string; size: number; sha256: string }[];
}

export function migrationsDir(): string {
	return resolve('drizzle');
}

export async function journalTags(): Promise<string[]> {
	const journal = JSON.parse(await readFile(join(migrationsDir(), 'meta/_journal.json'), 'utf8'));
	return journal.entries.map((entry: { tag: string }) => entry.tag);
}

function columnsOf(table: MySqlTable) {
	return getTableConfig(table).columns;
}

// Raw text for timestamps and JSON keeps a round trip byte-exact.
const typeCast = (
	field: { type: string; string: (encoding: string) => string | null },
	next: () => unknown
): unknown =>
	field.type === 'TIMESTAMP' || field.type === 'DATETIME' || field.type === 'JSON'
		? field.string('utf8')
		: next();

// The promise wrapper hides row streaming; the callback connection underneath has it.
function callbackConnection(conn: PoolConnection) {
	return (
		conn as unknown as {
			connection: {
				query: (options: object) => { stream: (options: object) => AsyncIterable<unknown> };
			};
		}
	).connection;
}

async function* dumpDatabase(conn: PoolConnection): AsyncGenerator<Buffer> {
	for (const [name, table] of Object.entries(BUNDLE_TABLES)) {
		const names = columnsOf(table).map((column) => column.name);
		yield Buffer.from(`${JSON.stringify({ table: name, columns: names })}\n`);
		const rows = callbackConnection(conn)
			.query({
				sql: `SELECT ${names.map((n) => `\`${n}\``).join(', ')} FROM \`${name}\``,
				typeCast
			})
			.stream({ highWaterMark: 256 });
		let pending = '';
		try {
			for await (const row of rows as AsyncIterable<Record<string, unknown>>) {
				pending += `${JSON.stringify(names.map((n) => row[n]))}\n`;
				if (pending.length > 1 << 16) {
					yield Buffer.from(pending);
					pending = '';
				}
			}
		} finally {
			(rows as unknown as { destroy: () => void }).destroy();
		}
		if (pending) yield Buffer.from(pending);
	}
}

// One REPEATABLE READ snapshot spans every table, so the dump is a single point in time.
// A streamed Bundle lists its files last: sizes and hashes are known only once they are sent.
export async function* exportBundle(): AsyncGenerator<Buffer> {
	const tags = await journalTags();
	const conn = await pool.getConnection();
	let clean = false;
	try {
		await conn.query("SET time_zone = '+00:00'");
		await conn.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
		await conn.query('START TRANSACTION WITH CONSISTENT SNAPSHOT');
		const hash = createHash('sha256');
		let size = 0;
		async function* entries(): AsyncGenerator<ZipSource> {
			yield {
				name: DB_FILE,
				data: (async function* () {
					for await (const chunk of dumpDatabase(conn)) {
						hash.update(chunk);
						size += chunk.length;
						yield chunk;
					}
				})()
			};
			const manifest: Manifest = {
				format: FORMAT,
				service: SERVICE,
				appVersion: pkg.version,
				schema: tags[tags.length - 1],
				createdAt: new Date().toISOString(),
				files: [{ path: DB_FILE, size, sha256: hash.digest('hex') }]
			};
			yield {
				name: MANIFEST_FILE,
				data: (async function* () {
					yield Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
				})()
			};
		}
		yield* writeZip(entries());
		clean = true;
	} finally {
		// A SELECT cut off mid-stream still owns the connection; closing it is the only way out.
		if (clean) {
			await conn.query('ROLLBACK').catch(() => {});
			conn.release();
		} else {
			conn.destroy();
		}
	}
}

export function bundleName(date = new Date()): string {
	return `beryl-${date.toISOString().replace(/[:.]/g, '-')}.zip`;
}

let importing = false;
export const isImporting = () => importing;

export interface VerifiedBundle {
	manifest: Manifest;
	entries: Map<string, ZipEntry>;
}

function refuse(message: string, status = 422): never {
	throw new ApiError(status, message);
}

function guard<T>(work: Promise<T>): Promise<T> {
	return work.catch((error) => {
		if (error instanceof ZipError) refuse(`bundle rejected: ${error.message}`);
		throw error;
	});
}

async function slurp(source: AsyncIterable<Buffer>, limit: number): Promise<Buffer> {
	const parts: Buffer[] = [];
	let total = 0;
	for await (const chunk of source) {
		total += chunk.length;
		if (total > limit) refuse('bundle rejected: manifest is too large');
		parts.push(chunk);
	}
	return Buffer.concat(parts);
}

// Everything checked before any write: structure, schema level, and every file's size and hash.
export async function verifyBundle(
	path: string,
	maxUnpackedBytes?: number
): Promise<VerifiedBundle> {
	const cap = maxUnpackedBytes ?? ADMIN_MAX_UNPACKED_MB * 1024 * 1024;
	const list = await guard(
		readDirectory(path, { maxEntries: 8, maxEntryBytes: cap, maxTotalBytes: cap })
	);
	const entries = new Map(list.map((entry) => [entry.name, entry]));
	const manifestEntry = entries.get(MANIFEST_FILE);
	if (!manifestEntry) refuse('bundle rejected: manifest.json is missing');

	let manifest: Manifest;
	try {
		manifest = JSON.parse(
			(await guard(slurp(readEntry(path, manifestEntry), MAX_MANIFEST_BYTES))).toString('utf8')
		);
	} catch (error) {
		if (error instanceof ApiError) throw error;
		refuse('bundle rejected: manifest.json is not valid JSON');
	}
	if (manifest.format !== FORMAT) refuse(`bundle rejected: unsupported format ${manifest.format}`);
	if (manifest.service !== SERVICE)
		refuse(`bundle rejected: made by ${manifest.service}, not beryl`);
	if (typeof manifest.schema !== 'string' || !Array.isArray(manifest.files)) {
		refuse('bundle rejected: malformed manifest');
	}

	const tags = await journalTags();
	const level = tags.indexOf(manifest.schema);
	if (level < 0) {
		refuse(
			`bundle rejected: schema ${JSON.stringify(manifest.schema)} is newer than this build (latest ${tags[tags.length - 1]})`,
			409
		);
	}

	const listed = new Set<string>();
	for (const file of manifest.files) {
		if (
			typeof file?.path !== 'string' ||
			!Number.isInteger(file.size) ||
			!/^[0-9a-f]{64}$/.test(file.sha256 ?? '')
		) {
			refuse('bundle rejected: malformed manifest file entry');
		}
		try {
			checkEntryName(file.path);
		} catch (error) {
			refuse(`bundle rejected: ${(error as Error).message}`);
		}
		if (listed.has(file.path)) refuse('bundle rejected: manifest lists a file twice');
		listed.add(file.path);
	}
	const extra = [...entries.keys()].filter((name) => name !== MANIFEST_FILE && !listed.has(name));
	if (extra.length) refuse(`bundle rejected: unlisted file ${JSON.stringify(extra[0])}`);
	if (!listed.has(DB_FILE) || listed.size !== 1) {
		refuse(`bundle rejected: a Bundle holds ${DB_FILE} and nothing else`);
	}

	for (const file of manifest.files) {
		const entry = entries.get(file.path);
		if (!entry) refuse(`bundle rejected: ${file.path} is missing`);
		if (entry.size !== file.size)
			refuse(`bundle rejected: ${file.path} size differs from the manifest`);
		const hash = createHash('sha256');
		let size = 0;
		await guard(
			(async () => {
				for await (const chunk of readEntry(path, entry)) {
					hash.update(chunk);
					size += chunk.length;
				}
			})()
		);
		if (size !== file.size || hash.digest('hex') !== file.sha256) {
			refuse(`bundle rejected: ${file.path} fails its checksum`);
		}
	}
	return { manifest, entries };
}

async function* lines(source: AsyncIterable<Buffer>): AsyncGenerator<string> {
	let rest: Buffer = Buffer.alloc(0);
	for await (const chunk of source) {
		rest = rest.length ? Buffer.concat([rest, chunk]) : chunk;
		let at: number;
		while ((at = rest.indexOf(10)) >= 0) {
			yield rest.toString('utf8', 0, at);
			rest = rest.subarray(at + 1);
		}
		if (rest.length > MAX_LINE_BYTES) refuse('bundle rejected: a database line is absurdly long');
	}
	if (rest.length) yield rest.toString('utf8');
}

export async function backupDir(): Promise<string> {
	const dir = ADMIN_BACKUP_DIR ?? join(tmpdir(), 'beryl-backups');
	await mkdir(dir, { recursive: true });
	return dir;
}

async function writeBackup(dir: string): Promise<string> {
	const target = join(dir, `beryl-pre-import-${bundleName().slice('beryl-'.length)}`);
	const partial = `${target}.part`;
	try {
		await pipeline(exportBundle(), createWriteStream(partial, { mode: 0o600 }));
		await rename(partial, target);
	} catch (error) {
		await rm(partial, { force: true });
		throw error;
	}
	const old = (await readdir(dir))
		.filter((name) => name.startsWith('beryl-pre-import-') && name.endsWith('.zip'))
		.sort()
		.slice(0, -BACKUPS_KEPT);
	await Promise.all(old.map((name) => rm(join(dir, name), { force: true })));
	return target;
}

function openTable(header: { table?: unknown; columns?: unknown }, rows: Record<string, number>) {
	const name = String(header.table);
	const target = Object.hasOwn(BUNDLE_TABLES, name) ? BUNDLE_TABLES[name] : undefined;
	if (!target || !Array.isArray(header.columns) || name in rows) {
		refuse(`bundle rejected: unexpected table ${JSON.stringify(name)}`);
	}
	const given = header.columns.map(String);
	const config = columnsOf(target);
	for (const column of config) {
		if (!given.includes(column.name) && column.notNull && !column.hasDefault) {
			refuse(`bundle rejected: ${name}.${column.name} is missing and has no default`);
		}
	}
	const known = new Set(config.map((column) => column.name));
	const pick = given.flatMap((column, index) => (known.has(column) ? [index] : []));
	rows[name] = 0;
	return {
		name,
		width: given.length,
		columns: pick.map((index) => given[index]),
		pick,
		pending: [] as unknown[][]
	};
}

export interface ImportResult {
	schema: string;
	appVersion: string;
	backup: string;
	rows: Record<string, number>;
	warning?: string;
}

// Replace-everything, in one transaction: either the whole Bundle lands or the database is
// untouched. Rows from an older schema carry only the columns that existed then; the rest take
// their defaults, and the boot-time backfill fills what a default cannot.
export async function importBundle(
	path: string,
	options: { backupDir?: string; allowEmpty?: boolean } = {}
): Promise<ImportResult> {
	if (importing) refuse('an import is already running', 409);
	importing = true;
	try {
		const { manifest, entries } = await verifyBundle(path);
		const dbEntry = entries.get(DB_FILE)!;
		const backup = await writeBackup(options.backupDir ?? (await backupDir()));

		const conn = await pool.getConnection();
		const rows: Record<string, number> = {};
		try {
			await conn.query("SET time_zone = '+00:00'");
			await conn.query('START TRANSACTION');
			for (const name of WIPE_ORDER) await conn.query(`DELETE FROM \`${name}\``);

			let table: ReturnType<typeof openTable> | undefined;
			const flush = async () => {
				if (!table?.pending.length) return;
				await conn.query(`INSERT INTO \`${table.name}\` (??) VALUES ?`, [
					table.columns,
					table.pending
				]);
				rows[table.name] += table.pending.length;
				table.pending = [];
			};
			for await (const line of lines(readEntry(path, dbEntry))) {
				if (line === '') continue;
				const parsed = JSON.parse(line);
				if (typeof parsed !== 'object' || parsed === null) {
					refuse('bundle rejected: a database line is neither a header nor a row');
				}
				if (!Array.isArray(parsed)) {
					await flush();
					table = openTable(parsed, rows);
					continue;
				}
				if (!table || parsed.length !== table.width) {
					refuse('bundle rejected: a row does not match its table header');
				}
				table.pending.push(table.pick.map((i) => parsed[i]));
				if (table.pending.length >= BATCH_ROWS) await flush();
			}
			await flush();
			const missing = Object.keys(BUNDLE_TABLES).filter((name) => !(name in rows));
			if (missing.length) refuse(`bundle rejected: no data for ${missing.join(', ')}`);
			if (rows.projects === 0 && !options.allowEmpty) {
				refuse('bundle rejected: it holds no Projects; pass allowEmpty to wipe the server', 409);
			}
			await conn.query('COMMIT');
		} catch (error) {
			await conn.query('ROLLBACK').catch(() => {});
			if (error instanceof SyntaxError) refuse('bundle rejected: db.ndjson is not valid');
			if (error instanceof ZipError) refuse(`bundle rejected: ${error.message}`);
			throw error;
		} finally {
			conn.release();
		}

		let warning: string | undefined;
		try {
			await backfillSlugs();
		} catch (error) {
			warning = 'imported, but the slug backfill failed; restart the server to retry it';
			log('admin.import.backfill_failed', { error: String(error) });
		}
		endStreams();
		log('admin.import', { schema: manifest.schema, backup });
		return { schema: manifest.schema, appVersion: manifest.appVersion, backup, rows, warning };
	} finally {
		importing = false;
	}
}

// Spools an upload to a private temp file, refusing past `maxBytes`. The caller removes `dir`.
export async function receiveUpload(
	request: Request,
	maxBytes: number
): Promise<{ dir: string; path: string }> {
	const declared = Number(request.headers.get('content-length') ?? 0);
	if (declared > maxBytes) refuse('bundle is larger than ADMIN_MAX_BUNDLE_MB allows', 413);
	if (!request.body) refuse('no bundle in the request body', 400);
	const dir = await mkdtemp(join(tmpdir(), 'beryl-import-'));
	const path = join(dir, 'upload.zip');
	let total = 0;
	try {
		const counted = new TransformStream<Uint8Array, Uint8Array>({
			transform(chunk, controller) {
				total += chunk.length;
				if (total > maxBytes) {
					controller.error(new ApiError(413, 'bundle is larger than ADMIN_MAX_BUNDLE_MB allows'));
					return;
				}
				controller.enqueue(chunk);
			}
		});
		await pipeline(
			Readable.fromWeb(request.body.pipeThrough(counted) as never),
			createWriteStream(path, { mode: 0o600 })
		);
		return { dir, path };
	} catch (error) {
		await rm(dir, { recursive: true, force: true });
		throw error;
	}
}
