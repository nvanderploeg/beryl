import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
	createClient,
	defaultConfigDir,
	gitRefs,
	repoFromRemote,
	repoIdentity,
	DEFAULT_CANDIDATES,
	UNREACHABLE_WARNING,
	type ClientOptions,
	type BerylClient,
	type Snapshot,
	type Topic
} from './index.ts';

const SERVER = 'http://localhost:3270';
const T = '2026-10-24T00:00:00.000Z';

const TOPIC: Topic = {
	id: 'topic-1',
	projectId: 'proj-1',
	title: 'Payments retry design',
	destination: '',
	summary: '',
	status: 'open',
	current: null,
	agent: null,
	repo: null,
	branch: null,
	createdAt: T,
	updatedAt: T,
	closedAt: null
};

const SNAPSHOT: Snapshot = {
	project: { id: 'proj-1', name: 'repo', createdAt: T, lastWriteAt: T },
	topic: TOPIC,
	nodes: [],
	notes: [],
	lastSeq: 0
};

interface Recorded {
	method: string;
	server: string;
	path: string;
	headers: Record<string, string>;
	body: unknown;
}

type Reply =
	| { status: number; body?: unknown; text?: string; headers?: Record<string, string> }
	| 'hang'
	| 'refuse';
type Handler = (req: Recorded) => Reply | Promise<Reply>;

interface Fake {
	fetch: typeof fetch;
	requests: Recorded[];
	writes: () => Recorded[];
}

function fakeFetch(handler: Handler): Fake {
	const requests: Recorded[] = [];
	const fn = async (input: string | URL | Request, init: RequestInit = {}) => {
		const url = new URL(String(input));
		const headers = Object.fromEntries(
			Object.entries((init.headers ?? {}) as Record<string, string>).map(([k, v]) => [
				k.toLowerCase(),
				v
			])
		);
		const rec: Recorded = {
			method: init.method ?? 'GET',
			server: url.origin,
			path: url.pathname + url.search,
			headers,
			body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined
		};
		requests.push(rec);
		const signal = init.signal;
		if (signal?.aborted) throw signal.reason;
		const aborted = new Promise<never>((_, reject) => {
			signal?.addEventListener('abort', () => reject(signal.reason));
		});
		aborted.catch(() => {});
		const reply = await Promise.race([handler(rec), aborted]);
		if (reply === 'refuse') throw new TypeError('fetch failed');
		if (reply === 'hang') return aborted;
		return new Response(reply.text ?? JSON.stringify(reply.body ?? {}), {
			status: reply.status,
			headers: { 'content-type': 'application/json', ...reply.headers }
		});
	};
	return {
		fetch: fn as typeof fetch,
		requests,
		writes: () => requests.filter((r) => r.path !== '/api/health')
	};
}

const healthy = (version = '0.1.0'): Reply => ({
	status: 200,
	body: { service: 'beryl', version, db: 'ok' }
});

const notFound: Reply = { status: 404, body: { error: 'not found' } };

// A beryl server that hands out proj-<n> with bw_<n>, pairing codes bp_<n>, and topic-<n> in it.
function berylServer(
	opts: { origin?: string; route?: (req: Recorded) => Reply | undefined } = {}
): Handler {
	let projects = 0;
	let topics = 0;
	let pairings = 0;
	const keys = new Map<string, string>();
	return async (req) => {
		const origin = opts.origin ?? req.server;
		const routed = opts.route?.(req);
		if (routed) return routed;
		if (req.method === 'GET' && req.path === '/api/health') return healthy();
		if (req.method === 'POST' && req.path === '/api/projects') {
			projects += 1;
			const id = `proj-${projects}`;
			keys.set(id, `bw_${projects}`);
			return {
				status: 201,
				body: {
					id,
					name: (req.body as { name?: string }).name ?? 'Untitled',
					writeKey: `bw_${projects}`,
					url: `${origin}/p/${id}`
				}
			};
		}
		const rename = /^\/api\/projects\/([^/]+)$/.exec(req.path);
		if (req.method === 'PATCH' && rename) {
			if (req.headers.authorization !== `Bearer ${keys.get(rename[1])}`) {
				return { status: 403, body: { error: 'invalid key' } };
			}
			const name = (req.body as { name: string }).name;
			return {
				status: 200,
				body: { project: { id: rename[1], name, createdAt: T, lastWriteAt: T } }
			};
		}
		const pairing = /^\/api\/projects\/([^/]+)\/pairings$/.exec(req.path);
		if (req.method === 'POST' && pairing) {
			if (req.headers.authorization !== `Bearer ${keys.get(pairing[1])}`) {
				return { status: 403, body: { error: 'invalid key' } };
			}
			pairings += 1;
			return { status: 201, body: { code: `bp_${pairings}`, expiresAt: T } };
		}
		const topic = /^\/api\/projects\/([^/]+)\/topics$/.exec(req.path);
		if (req.method === 'POST' && topic) {
			const projectId = topic[1];
			if (req.headers.authorization !== `Bearer ${keys.get(projectId)}`) {
				return { status: 403, body: { error: 'invalid key' } };
			}
			topics += 1;
			const topicId = `topic-${topics}`;
			return {
				status: 201,
				body: {
					topicId,
					url: `${origin}/p/${projectId}/t/${topicId}`,
					topic: { ...TOPIC, id: topicId, projectId },
					nodes: []
				}
			};
		}
		return notFound;
	};
}

let configDir: string;
const tempDirs: string[] = [];

function tempDir(prefix = 'beryl-'): string {
	const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
	tempDirs.push(dir);
	return dir;
}

function makeClient(fake: Fake, options: Partial<ClientOptions> = {}): BerylClient {
	return createClient({
		env: {},
		configDir,
		candidates: [SERVER],
		probeTimeoutMs: 100,
		remoteProbeTimeoutMs: 100,
		requestTimeoutMs: 100,
		fetch: fake.fetch,
		sleep: async () => {},
		...options
	});
}

function writeRaw(name: string, text: string): void {
	fs.mkdirSync(configDir, { recursive: true });
	fs.writeFileSync(path.join(configDir, name), text);
}

const seedFile = (name: string, data: unknown) => writeRaw(name, JSON.stringify(data));
const readFile = (name: string): unknown =>
	JSON.parse(fs.readFileSync(path.join(configDir, name), 'utf8'));
const modeOf = (name: string) => fs.statSync(path.join(configDir, name)).mode & 0o777;

function seedHandle(opts: { server?: string; topicId?: string } = {}) {
	const server = opts.server ?? SERVER;
	const topicId = opts.topicId ?? 'topic-1';
	seedFile('projects.json', {
		[server]: {
			'/elsewhere/.git': {
				projectId: 'proj-0',
				writeKey: 'bw_other',
				name: 'other',
				projectUrl: `${server}/p/proj-0`
			},
			'/work/repo/.git': {
				projectId: 'proj-1',
				writeKey: 'bw_1',
				name: 'repo',
				projectUrl: `${server}/p/proj-1`
			}
		}
	});
	seedFile('topics.json', {
		[topicId]: { server, projectId: 'proj-1', projectUrl: `${server}/p/proj-1` }
	});
}

function git(cwd: string, args: string[]): void {
	execFileSync(
		'git',
		[
			'-c',
			'user.name=Test',
			'-c',
			'user.email=test@example.com',
			'-c',
			'commit.gpgsign=false',
			...args
		],
		{ cwd, stdio: 'pipe' }
	);
}

beforeEach(() => {
	configDir = tempDir('beryl-config-');
});

afterEach(() => {
	for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('exported constants', () => {
	it('probes the local server, then the hosted one', () => {
		expect(DEFAULT_CANDIDATES).toEqual(['http://localhost:3270', 'https://beryl.nanzero.com']);
	});

	it('uses the exact unreachable warning text', () => {
		expect(UNREACHABLE_WARNING).toBe('beryl unreachable — continuing without the board');
	});

	it('keeps config under XDG_CONFIG_HOME, else ~/.config', () => {
		expect(defaultConfigDir({ XDG_CONFIG_HOME: '/x' })).toBe('/x/beryl');
		expect(defaultConfigDir({})).toBe(path.join(os.homedir(), '.config', 'beryl'));
	});
});

describe('discover', () => {
	it('probes BERYL_URL alone, trimmed and without trailing slashes', async () => {
		const fake = fakeFetch(() => healthy());
		const client = makeClient(fake, {
			env: { BERYL_URL: '  http://pinned.test:9000//  ' },
			candidates: ['http://candidate.test']
		});

		expect(await client.discover()).toBe('http://pinned.test:9000');
		expect(fake.requests.map((r) => `${r.method} ${r.server}${r.path}`)).toEqual([
			'GET http://pinned.test:9000/api/health'
		]);
	});

	it('returns null for an unhealthy BERYL_URL and never tries the candidates', async () => {
		const fake = fakeFetch((req) => (req.server === 'http://pinned.test' ? 'refuse' : healthy()));
		const client = makeClient(fake, {
			env: { BERYL_URL: 'http://pinned.test' },
			candidates: ['http://candidate.test']
		});

		expect(await client.discover()).toBeNull();
		expect(fake.requests.map((r) => r.server)).toEqual(['http://pinned.test']);
	});

	it('treats an empty BERYL_URL as unset', async () => {
		const fake = fakeFetch(() => healthy());
		const client = makeClient(fake, { env: { BERYL_URL: '' } });

		expect(await client.discover()).toBe(SERVER);
	});

	it('returns the first healthy candidate in order, skipping one that is down', async () => {
		const fake = fakeFetch((req) => (req.server === 'http://down.test' ? 'refuse' : healthy()));
		const client = makeClient(fake, {
			candidates: ['http://down.test', 'http://second.test/', 'http://third.test']
		});

		expect(await client.discover()).toBe('http://second.test');
		expect(fake.requests.map((r) => r.server)).toEqual(['http://down.test', 'http://second.test']);
	});

	it.each([
		['names another service', { status: 200, body: { service: 'chronicle', db: 'ok' } }],
		['answers 503', { status: 503, body: { service: 'beryl', db: 'unavailable' } }],
		['answers 200 with a body that is not JSON', { status: 200, text: 'ok' }],
		['answers 404', notFound]
	] as const)('does not count a server that %s as healthy', async (_label, reply) => {
		const client = makeClient(fakeFetch(() => reply));

		expect(await client.discover()).toBeNull();
	});

	it('gives up on a probe that never answers', async () => {
		const client = makeClient(
			fakeFetch(() => 'hang'),
			{ probeTimeoutMs: 20 }
		);

		expect(await client.discover()).toBeNull();
	});

	it('gives a remote candidate the longer probe timeout and a loopback one the short one', async () => {
		const slow = fakeFetch(
			() => new Promise<Reply>((resolve) => setTimeout(() => resolve(healthy()), 60))
		);
		const options = { probeTimeoutMs: 20, remoteProbeTimeoutMs: 1000 };

		expect(
			await makeClient(slow, { ...options, candidates: ['http://127.0.0.1:3270'] }).discover()
		).toBeNull();
		expect(
			await makeClient(slow, { ...options, candidates: ['https://beryl.example'] }).discover()
		).toBe('https://beryl.example');
	});
});

describe('openTopic creating a topic', () => {
	it('creates a Project named after the repo, posts the Topic with its Write key and records both registries', async () => {
		const fake = fakeFetch(berylServer());
		const cwd = tempDir('beryl-repo-');
		const client = makeClient(fake);

		const result = await client.openTopic({
			title: 'Payments retry design',
			destination: 'A spec for retries',
			summary: 'the summary',
			nodes: [{ path: 'storage', kind: 'area' }],
			cwd
		});

		expect(result).toEqual({
			ok: true,
			value: {
				topicId: 'topic-1',
				url: `${SERVER}/p/proj-1/t/topic-1`,
				noteUrl: `${SERVER}/p/proj-1/t/topic-1#pc=bp_1`,
				projectUrl: `${SERVER}/p/proj-1`,
				server: SERVER,
				projectId: 'proj-1',
				createdProject: true,
				resumed: false
			}
		});
		const writes = fake.writes();
		expect(writes.map((r) => `${r.method} ${r.path}`)).toEqual([
			'POST /api/projects',
			'POST /api/projects/proj-1/topics',
			'POST /api/projects/proj-1/pairings'
		]);
		expect(writes[0].body).toEqual({ name: path.basename(cwd) });
		expect(writes[1].headers.authorization).toBe('Bearer bw_1');
		expect(writes[1].body).toEqual({
			title: 'Payments retry design',
			destination: 'A spec for retries',
			summary: 'the summary',
			nodes: [{ path: 'storage', kind: 'area' }]
		});

		expect(readFile('projects.json')).toEqual({
			[SERVER]: {
				[cwd]: {
					projectId: 'proj-1',
					writeKey: 'bw_1',
					name: path.basename(cwd),
					projectUrl: `${SERVER}/p/proj-1`
				}
			}
		});
		expect(readFile('topics.json')).toEqual({
			'topic-1': { server: SERVER, projectId: 'proj-1', projectUrl: `${SERVER}/p/proj-1` }
		});
		expect(modeOf('projects.json')).toBe(0o600);
		expect(modeOf('topics.json')).toBe(0o600);
		expect(fs.readdirSync(configDir).sort()).toEqual(['projects.json', 'topics.json']);
	});

	it('leaves undefined optional fields out of the topic body', async () => {
		const fake = fakeFetch(berylServer());
		const client = makeClient(fake);

		await client.openTopic({ title: 'Only a title', cwd: tempDir() });

		const post = fake.writes().find((r) => r.path.endsWith('/topics'));
		expect(Object.keys(post?.body as object)).toEqual(['title']);
	});

	it('names a new Project after `project` when given', async () => {
		const fake = fakeFetch(berylServer());
		const client = makeClient(fake);

		await client.openTopic({ title: 'x', project: 'Billing', cwd: tempDir() });

		expect(fake.writes()[0].body).toEqual({ name: 'Billing' });
	});

	it('reuses the registered Project for later topics in the same repo', async () => {
		const fake = fakeFetch(berylServer());
		const cwd = tempDir();
		const client = makeClient(fake);

		const first = await client.openTopic({ title: 'one', cwd });
		const second = await client.openTopic({ title: 'two', cwd });

		expect(first).toMatchObject({ ok: true, value: { createdProject: true, topicId: 'topic-1' } });
		expect(second).toMatchObject({
			ok: true,
			value: { createdProject: false, topicId: 'topic-2', projectId: 'proj-1' }
		});
		expect(fake.writes().filter((r) => r.path === '/api/projects')).toHaveLength(1);
		const handle = { server: SERVER, projectId: 'proj-1', projectUrl: `${SERVER}/p/proj-1` };
		expect(readFile('topics.json')).toEqual({ 'topic-1': handle, 'topic-2': handle });
	});

	it('renames the registered Project once when a later open names it differently', async () => {
		const fake = fakeFetch(berylServer());
		const cwd = tempDir();
		const client = makeClient(fake);

		await client.openTopic({ title: 'one', cwd });
		await client.openTopic({ title: 'two', project: 'Billing', cwd });
		await client.openTopic({ title: 'three', project: 'Billing', cwd });

		const patches = fake.writes().filter((r) => r.method === 'PATCH');
		expect(patches).toHaveLength(1);
		expect(patches[0]).toMatchObject({
			path: '/api/projects/proj-1',
			headers: { authorization: 'Bearer bw_1' },
			body: { name: 'Billing' }
		});
		expect(readFile('projects.json')).toMatchObject({ [SERVER]: { [cwd]: { name: 'Billing' } } });
	});

	it('opens two topics at once in one repo under a single new Project', async () => {
		const fake = fakeFetch(berylServer());
		const cwd = tempDir();

		const results = await Promise.all([
			makeClient(fake).openTopic({ title: 'a', cwd }),
			makeClient(fake).openTopic({ title: 'b', cwd })
		]);

		expect(results.every((r) => r.ok)).toBe(true);
		expect(fake.writes().filter((r) => r.path === '/api/projects')).toHaveLength(1);
		expect(Object.keys(readFile('topics.json') as object).sort()).toEqual(['topic-1', 'topic-2']);
	});

	it.each([401, 403, 404])(
		'creates a fresh Project, overwrites the registry and retries once when the topic POST answers %i',
		async (status) => {
			const cwd = tempDir();
			seedFile('projects.json', {
				[SERVER]: {
					[cwd]: {
						projectId: 'proj-gone',
						writeKey: 'bw_gone',
						name: 'stale',
						projectUrl: `${SERVER}/p/proj-gone`
					}
				}
			});
			const fake = fakeFetch(
				berylServer({
					route: (req) =>
						req.path === '/api/projects/proj-gone/topics'
							? { status, body: { error: 'stale' } }
							: undefined
				})
			);
			const client = makeClient(fake);

			const result = await client.openTopic({ title: 'x', cwd });

			expect(result).toMatchObject({
				ok: true,
				value: { topicId: 'topic-1', projectId: 'proj-1', createdProject: true }
			});
			const posts = fake.writes().filter((r) => r.path.endsWith('/topics'));
			expect(posts.map((r) => [r.path, r.headers.authorization])).toEqual([
				['/api/projects/proj-gone/topics', 'Bearer bw_gone'],
				['/api/projects/proj-1/topics', 'Bearer bw_1']
			]);
			expect(posts[1].body).toEqual(posts[0].body);
			expect(readFile('projects.json')).toEqual({
				[SERVER]: {
					[cwd]: {
						projectId: 'proj-1',
						writeKey: 'bw_1',
						name: path.basename(cwd),
						projectUrl: `${SERVER}/p/proj-1`
					}
				}
			});
		}
	);

	it('does not retry a second time when the fresh Project is refused too', async () => {
		const cwd = tempDir();
		const fake = fakeFetch(
			berylServer({
				route: (req) =>
					req.path.endsWith('/topics') ? { status: 404, body: { error: 'gone' } } : undefined
			})
		);
		const client = makeClient(fake);

		const result = await client.openTopic({ title: 'x', cwd });

		expect(result).toEqual({ ok: false, warning: 'beryl rejected the write: gone' });
		expect(fake.writes().filter((r) => r.path.endsWith('/topics'))).toHaveLength(1);
	});

	it('returns the unreachable warning and writes nothing when no server is healthy', async () => {
		const client = makeClient(fakeFetch(() => 'refuse'));

		expect(await client.openTopic({ title: 'x', cwd: tempDir() })).toEqual({
			ok: false,
			warning: UNREACHABLE_WARNING
		});
		expect(fs.readdirSync(configDir)).toEqual([]);
	});

	it('returns the unreachable warning when creating the Project answers 500', async () => {
		const fake = fakeFetch((req) =>
			req.path === '/api/health' ? healthy() : { status: 500, body: { error: 'boom' } }
		);

		expect(await makeClient(fake).openTopic({ title: 'x', cwd: tempDir() })).toEqual({
			ok: false,
			warning: UNREACHABLE_WARNING
		});
	});

	it('returns the unreachable warning when the topic POST never answers', async () => {
		const fake = fakeFetch(
			berylServer({ route: (req) => (req.path.endsWith('/topics') ? 'hang' : undefined) })
		);

		expect(await makeClient(fake).openTopic({ title: 'x', cwd: tempDir() })).toEqual({
			ok: false,
			warning: UNREACHABLE_WARNING
		});
	});

	it('passes a refused topic body back as a rejection', async () => {
		const fake = fakeFetch(
			berylServer({
				route: (req) =>
					req.path.endsWith('/topics')
						? { status: 400, body: { error: 'kind is required to create storage' } }
						: undefined
			})
		);

		expect(await makeClient(fake).openTopic({ title: 'x', cwd: tempDir() })).toEqual({
			ok: false,
			warning: 'beryl rejected the write: kind is required to create storage'
		});
	});

	it('asks for a title without contacting any server', async () => {
		const fake = fakeFetch(berylServer());

		const result = await makeClient(fake).openTopic({ destination: 'd', cwd: tempDir() });

		expect(result.ok).toBe(false);
		expect(!result.ok && result.warning).toMatch(/title/);
		expect(fake.requests).toHaveLength(0);
	});

	it.each(['projects.json', 'topics.json'])(
		'leaves a damaged %s untouched and opens nothing, so stored keys survive',
		async (name) => {
			const fake = fakeFetch(berylServer());
			writeRaw(name, '{"almost": "json",}');

			const result = await makeClient(fake).openTopic({ title: 'x', cwd: tempDir() });

			expect(result).toEqual({
				ok: false,
				warning: `beryl failed: ${path.join(configDir, name)} is not a JSON object; fix or delete it`
			});
			expect(fs.readFileSync(path.join(configDir, name), 'utf8')).toBe('{"almost": "json",}');
			expect(fake.writes()).toHaveLength(0);
		}
	);

	it('links to the public origin the server answers with, not the address it was reached on', async () => {
		const PUBLIC = 'https://beryl.example.com';
		const fake = fakeFetch(berylServer({ origin: PUBLIC }));
		const client = makeClient(fake);

		const opened = await client.openTopic({ title: 'x', cwd: tempDir() });

		expect(opened).toMatchObject({
			ok: true,
			value: {
				url: `${PUBLIC}/p/proj-1/t/topic-1`,
				noteUrl: `${PUBLIC}/p/proj-1/t/topic-1#pc=bp_1`,
				projectUrl: `${PUBLIC}/p/proj-1`,
				server: SERVER
			}
		});
		expect(await client.topicUrl({ topicId: 'topic-1' })).toEqual({
			ok: true,
			value: { url: `${PUBLIC}/p/proj-1/t/topic-1` }
		});
	});

	it('posts to BERYL_URL alone when it is set', async () => {
		const fake = fakeFetch(berylServer());
		const client = makeClient(fake, {
			env: { BERYL_URL: 'http://pinned.test' },
			candidates: ['http://other.test']
		});

		const result = await client.openTopic({ title: 'x', cwd: tempDir() });

		expect(result).toMatchObject({ ok: true, value: { server: 'http://pinned.test' } });
		expect(new Set(fake.requests.map((r) => r.server))).toEqual(new Set(['http://pinned.test']));
	});

	it('sends the repo and branch of the git checkout it runs in', async () => {
		const fake = fakeFetch(berylServer());
		const cwd = tempDir();
		git(cwd, ['init', '-q', '-b', 'feat/retries']);
		git(cwd, ['remote', 'add', 'origin', 'git@github.com:me/payments.git']);

		await makeClient(fake).openTopic({ title: 'x', cwd });

		const post = fake.writes().find((r) => r.path.endsWith('/topics'));
		expect(post?.body).toMatchObject({ repo: 'me/payments', branch: 'feat/retries' });
	});

	it('lets an explicit repo and branch win over git', async () => {
		const fake = fakeFetch(berylServer());
		const cwd = tempDir();
		git(cwd, ['init', '-q', '-b', 'main']);

		await makeClient(fake).openTopic({ title: 'x', repo: 'o/r', branch: 'b', cwd });

		const post = fake.writes().find((r) => r.path.endsWith('/topics'));
		expect(post?.body).toMatchObject({ repo: 'o/r', branch: 'b' });
	});

	it('fills agent.tool with claude-code when CLAUDECODE=1 and the caller named no tool', async () => {
		const fake = fakeFetch(berylServer());
		const client = makeClient(fake, { env: { CLAUDECODE: '1' } });

		await client.openTopic({ title: 'a', agent: { model: 'm' }, cwd: tempDir() });
		await client.openTopic({ title: 'b', agent: { tool: 'codex' }, cwd: tempDir() });

		const posts = fake.writes().filter((r) => r.path.endsWith('/topics'));
		expect((posts[0].body as { agent: unknown }).agent).toEqual({
			model: 'm',
			tool: 'claude-code'
		});
		expect((posts[1].body as { agent: unknown }).agent).toEqual({ tool: 'codex' });
	});

	it('creates a missing configDir with mode 0700', async () => {
		configDir = path.join(configDir, 'nested', 'beryl');
		const client = makeClient(fakeFetch(berylServer()));

		expect((await client.openTopic({ title: 'x', cwd: tempDir() })).ok).toBe(true);
		expect(fs.statSync(configDir).mode & 0o777).toBe(0o700);
	});
});

describe('openTopic resuming a topic', () => {
	it('confirms the Topic on its handle server and returns its links without creating anything', async () => {
		seedHandle();
		const fake = fakeFetch((req) => {
			if (req.method === 'GET' && req.path === '/api/topics/topic-1') {
				return { status: 200, body: SNAPSHOT };
			}
			if (req.method === 'POST' && req.path === '/api/projects/proj-1/pairings') {
				return { status: 201, body: { code: 'bp_1', expiresAt: T } };
			}
			return notFound;
		});

		const result = await makeClient(fake, { candidates: ['http://elsewhere.test'] }).openTopic({
			topicId: 'topic-1',
			title: 'ignored'
		});

		expect(result).toEqual({
			ok: true,
			value: {
				topicId: 'topic-1',
				url: `${SERVER}/p/proj-1/t/topic-1`,
				noteUrl: `${SERVER}/p/proj-1/t/topic-1#pc=bp_1`,
				projectUrl: `${SERVER}/p/proj-1`,
				server: SERVER,
				projectId: 'proj-1',
				createdProject: false,
				resumed: true
			}
		});
		expect(fake.requests.map((r) => `${r.method} ${r.server}${r.path}`)).toEqual([
			`GET ${SERVER}/api/topics/topic-1`,
			`POST ${SERVER}/api/projects/proj-1/pairings`
		]);
	});

	it('names a Topic this machine has no handle for, without contacting any server', async () => {
		const fake = fakeFetch(berylServer());

		expect(await makeClient(fake).openTopic({ topicId: 'topic-9' })).toEqual({
			ok: false,
			warning: 'unknown topic topic-9 on this machine'
		});
		expect(fake.requests).toHaveLength(0);
	});

	it('reports a Topic the server no longer has', async () => {
		seedHandle();
		const fake = fakeFetch(() => ({ status: 404, body: { error: 'topic not found' } }));

		expect(await makeClient(fake).openTopic({ topicId: 'topic-1' })).toEqual({
			ok: false,
			warning: 'beryl rejected the write: topic not found'
		});
	});
});

describe('topic-scoped calls', () => {
	const ok =
		(body: unknown): Handler =>
		() => ({ status: 200, body });

	it.each([
		[
			'putNodes',
			(c: BerylClient) => c.putNodes({ topicId: 'topic-1', nodes: [{ path: 'a', kind: 'fact' }] }),
			'PUT /api/topics/topic-1/nodes',
			{ nodes: [{ path: 'a', kind: 'fact' }] },
			{ nodes: [] },
			'bw_1'
		],
		[
			'removeNodes',
			(c: BerylClient) => c.removeNodes({ topicId: 'topic-1', paths: ['a', 'b'] }),
			'DELETE /api/topics/topic-1/nodes',
			{ paths: ['a', 'b'] },
			{ removed: ['a', 'b'] },
			'bw_1'
		],
		[
			'moveNode',
			(c: BerylClient) => c.moveNode({ topicId: 'topic-1', from: 'a', to: 'b' }),
			'POST /api/topics/topic-1/move',
			{ from: 'a', to: 'b' },
			{ moved: [{ from: 'a', to: 'b' }] },
			'bw_1'
		],
		[
			'updateTopic',
			(c: BerylClient) =>
				c.updateTopic({ topicId: 'topic-1', status: 'closed', current: null, title: 't' }),
			'PATCH /api/topics/topic-1',
			{ status: 'closed', current: null, title: 't' },
			{ topic: TOPIC },
			'bw_1'
		],
		[
			'pullNotes',
			(c: BerylClient) => c.pullNotes({ topicId: 'topic-1' }),
			'POST /api/topics/topic-1/pull',
			undefined,
			{ notes: [], unresolved: [], context: {}, stale: [] },
			'bw_1'
		],
		[
			'resolveNotes',
			(c: BerylClient) =>
				c.resolveNotes({
					topicId: 'topic-1',
					notes: [{ id: 'n1', reply: 'done', changed: ['a'] }, { id: 'n2' }]
				}),
			'POST /api/topics/topic-1/resolve',
			{ notes: [{ id: 'n1', reply: 'done', changed: ['a'] }, { id: 'n2' }] },
			{ notes: [] },
			'bw_1'
		],
		[
			'addNote',
			(c: BerylClient) =>
				c.addNote({
					topicId: 'topic-1',
					anchor: { path: 'a', widget: 'w', element: 'e' },
					intent: 'comment',
					text: 'hi'
				}),
			'POST /api/topics/topic-1/notes',
			{ anchor: { path: 'a', widget: 'w', element: 'e' }, intent: 'comment', text: 'hi' },
			{ note: { id: 'n1' } },
			'bw_1'
		],
		[
			'send',
			(c: BerylClient) => c.send({ topicId: 'topic-1' }),
			'POST /api/topics/topic-1/send',
			undefined,
			{ sent: 2 },
			'bw_1'
		]
	] as const)(
		'%s sends %s… to the handle server with the right key',
		async (_name, invoke, route, body, answer, key) => {
			seedHandle();
			const fake = fakeFetch(ok(answer));

			const result = await invoke(makeClient(fake, { candidates: ['http://elsewhere.test'] }));

			expect(result).toEqual({ ok: true, value: answer });
			expect(fake.requests).toHaveLength(1);
			const [req] = fake.requests;
			expect(`${req.method} ${req.path}`).toBe(route);
			expect(req.server).toBe(SERVER);
			expect(req.headers.authorization).toBe(`Bearer ${key}`);
			expect(req.body).toEqual(body);
		}
	);

	it('marks every non-GET request as JSON, bodyless ones included, so the server never reads them as form posts', async () => {
		seedHandle();
		const fake = fakeFetch(ok({ notes: [], unresolved: [], context: {}, stale: [] }));

		await makeClient(fake).pullNotes({ topicId: 'topic-1' });

		expect(fake.requests[0].body).toBeUndefined();
		expect(fake.requests[0].headers['content-type']).toBe('application/json');
	});

	it('getTopic reads the Snapshot without a key and returns the Share link', async () => {
		seedHandle();
		const fake = fakeFetch(ok(SNAPSHOT));

		expect(await makeClient(fake).getTopic({ topicId: 'topic-1' })).toEqual({
			ok: true,
			value: {
				snapshot: SNAPSHOT,
				url: `${SERVER}/p/proj-1/t/topic-1`
			}
		});
		expect(fake.requests[0].headers.authorization).toBeUndefined();
	});

	it('topicUrl gives the Share link, or the Private link when asked', async () => {
		seedHandle();
		const fake = fakeFetch(() => ({ status: 201, body: { code: 'bp_1', expiresAt: T } }));
		const client = makeClient(fake);

		expect(await client.topicUrl({ topicId: 'topic-1' })).toEqual({
			ok: true,
			value: { url: `${SERVER}/p/proj-1/t/topic-1` }
		});
		expect(fake.requests).toHaveLength(0);
		expect(await client.topicUrl({ topicId: 'topic-1', private: true })).toEqual({
			ok: true,
			value: { url: `${SERVER}/p/proj-1/t/topic-1#pc=bp_1` }
		});
		expect(fake.requests[0].headers.authorization).toBe('Bearer bw_1');
	});

	it('mints a fresh code for every Private link', async () => {
		seedHandle();
		let n = 0;
		const client = makeClient(
			fakeFetch(() => ({ status: 201, body: { code: `bp_${++n}`, expiresAt: T } }))
		);

		const first = await client.topicUrl({ topicId: 'topic-1', private: true });
		const second = await client.topicUrl({ topicId: 'topic-1', private: true });

		expect(first).toEqual({ ok: true, value: { url: `${SERVER}/p/proj-1/t/topic-1#pc=bp_1` } });
		expect(second).toEqual({ ok: true, value: { url: `${SERVER}/p/proj-1/t/topic-1#pc=bp_2` } });
	});

	it('fails topicUrl when the server refuses to mint a code', async () => {
		seedHandle();
		const client = makeClient(fakeFetch(() => 'refuse'));

		expect(await client.topicUrl({ topicId: 'topic-1', private: true })).toEqual({
			ok: false,
			warning: UNREACHABLE_WARNING
		});
	});

	it('resumes with the read-only link and says so when the server refuses to mint a code', async () => {
		seedHandle();
		const fake = fakeFetch((req) =>
			req.method === 'GET' ? { status: 200, body: SNAPSHOT } : { status: 503 }
		);

		const result = await makeClient(fake, { candidates: ['http://elsewhere.test'] }).openTopic({
			topicId: 'topic-1'
		});

		expect(result).toMatchObject({
			ok: true,
			value: {
				noteUrl: `${SERVER}/p/proj-1/t/topic-1`,
				warning: expect.stringContaining('read-only')
			}
		});
	});

	it.each([
		['getTopic', (c: BerylClient) => c.getTopic({ topicId: 'nope' })],
		['putNodes', (c: BerylClient) => c.putNodes({ topicId: 'nope', nodes: [] })],
		['removeNodes', (c: BerylClient) => c.removeNodes({ topicId: 'nope', paths: ['a'] })],
		['moveNode', (c: BerylClient) => c.moveNode({ topicId: 'nope', from: 'a', to: 'b' })],
		['updateTopic', (c: BerylClient) => c.updateTopic({ topicId: 'nope', title: 't' })],
		['pullNotes', (c: BerylClient) => c.pullNotes({ topicId: 'nope' })],
		['resolveNotes', (c: BerylClient) => c.resolveNotes({ topicId: 'nope', notes: [] })],
		['waitForSent', (c: BerylClient) => c.waitForSent({ topicId: 'nope' })],
		[
			'addNote',
			(c: BerylClient) => c.addNote({ topicId: 'nope', anchor: { path: null }, intent: 'accept' })
		],
		['send', (c: BerylClient) => c.send({ topicId: 'nope' })],
		['topicUrl', (c: BerylClient) => c.topicUrl({ topicId: 'nope' })]
	] as const)('%s names an unknown topic without contacting any server', async (_name, invoke) => {
		seedHandle();
		const fake = fakeFetch(ok({}));

		expect(await invoke(makeClient(fake))).toEqual({
			ok: false,
			warning: 'unknown topic nope on this machine'
		});
		expect(fake.requests).toHaveLength(0);
	});

	it('names a damaged topics.json and leaves it untouched', async () => {
		writeRaw('topics.json', '[1, 2]');
		const fake = fakeFetch(ok({}));

		expect(await makeClient(fake).pullNotes({ topicId: 'topic-1' })).toEqual({
			ok: false,
			warning: `beryl failed: ${path.join(configDir, 'topics.json')} is not a JSON object; fix or delete it`
		});
		expect(fs.readFileSync(path.join(configDir, 'topics.json'), 'utf8')).toBe('[1, 2]');
		expect(fake.requests).toHaveLength(0);
	});

	it('waits out a short Retry-After on 429 and sends the write once more', async () => {
		seedHandle();
		let calls = 0;
		const fake = fakeFetch(() =>
			++calls === 1
				? {
						status: 429,
						headers: { 'retry-after': '2' },
						body: { error: 'too many writes from this address; retry later' }
					}
				: { status: 200, body: { removed: ['a'] } }
		);
		const sleep = vi.fn(async () => {});

		const result = await makeClient(fake, { sleep }).removeNodes({
			topicId: 'topic-1',
			paths: ['a']
		});

		expect(result).toEqual({ ok: true, value: { removed: ['a'] } });
		expect(sleep).toHaveBeenCalledExactlyOnceWith(2000, undefined);
		expect(fake.requests).toHaveLength(2);
	});

	it('reports a 429 whose Retry-After is too long to wait, without retrying', async () => {
		seedHandle();
		const fake = fakeFetch(() => ({
			status: 429,
			headers: { 'retry-after': '6' },
			body: { error: 'too many writes from this address; retry later' }
		}));
		const sleep = vi.fn(async () => {});

		const result = await makeClient(fake, { sleep }).putNodes({ topicId: 'topic-1', nodes: [] });

		expect(result).toEqual({
			ok: false,
			warning: 'beryl rejected the write: too many writes from this address; retry later'
		});
		expect(sleep).not.toHaveBeenCalled();
		expect(fake.requests).toHaveLength(1);
	});

	it.each([
		['a 500', { status: 500, body: { error: 'boom' } }, UNREACHABLE_WARNING],
		['a 502', { status: 502, text: 'bad gateway' }, UNREACHABLE_WARNING],
		['a 503', { status: 503, body: {} }, UNREACHABLE_WARNING],
		['a refused connection', 'refuse', UNREACHABLE_WARNING],
		['a request that never answers', 'hang', UNREACHABLE_WARNING],
		['a 2xx that is not JSON', { status: 200, text: '<html>' }, UNREACHABLE_WARNING],
		[
			'a 403 with an error',
			{ status: 403, body: { error: 'invalid key' } },
			'beryl rejected the write: invalid key'
		],
		[
			'a 400 with an error',
			{ status: 400, body: { error: 'no node storage' } },
			'beryl rejected the write: no node storage'
		],
		['a 418 without an error', { status: 418, text: '' }, 'beryl rejected the write: HTTP 418']
	] as const)('maps %s to its warning', async (_label, reply, warning) => {
		seedHandle();
		const client = makeClient(
			fakeFetch(() => reply as Reply),
			{ requestTimeoutMs: 20 }
		);

		expect(await client.moveNode({ topicId: 'topic-1', from: 'a', to: 'b' })).toEqual({
			ok: false,
			warning
		});
	});
});

describe('waitForSent', () => {
	const sentAfter = (answers: (number | Reply)[]): Handler => {
		let i = 0;
		return () => {
			const next = answers[Math.min(i++, answers.length - 1)];
			return typeof next === 'number' ? { status: 200, body: { sent: next } } : next;
		};
	};

	it('long-polls the wait route with the Write key and returns the sent count', async () => {
		seedHandle();
		const fake = fakeFetch(sentAfter([0, 0, 3]));

		const result = await makeClient(fake).waitForSent({ topicId: 'topic-1', pollMs: 25_000 });

		expect(result).toEqual({ ok: true, value: { sent: 3 } });
		expect(fake.requests.map((r) => `${r.method} ${r.server}${r.path}`)).toEqual(
			Array(3).fill(`GET ${SERVER}/api/topics/topic-1/wait?timeoutMs=25000`)
		);
		expect(fake.requests[0].headers.authorization).toBe('Bearer bw_1');
	});

	it('backs off from 1 s, doubling to 30 s, and starts over after a good answer', async () => {
		seedHandle();
		const down = { status: 503, body: {} } as const;
		const fake = fakeFetch(
			sentAfter(['refuse', down, 'refuse', down, 'refuse', down, 'refuse', 0, 'refuse', 1])
		);
		const sleep = vi.fn<(ms: number, signal?: AbortSignal) => Promise<void>>(async () => {});

		const result = await makeClient(fake, { sleep }).waitForSent({ topicId: 'topic-1' });

		expect(result).toEqual({ ok: true, value: { sent: 1 } });
		expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([
			1000, 2000, 4000, 8000, 16_000, 30_000, 30_000, 1000
		]);
	});

	it('returns the warning of a 4xx without polling again', async () => {
		seedHandle();
		const fake = fakeFetch(() => ({ status: 403, body: { error: 'invalid key' } }));

		expect(await makeClient(fake).waitForSent({ topicId: 'topic-1' })).toEqual({
			ok: false,
			warning: 'beryl rejected the write: invalid key'
		});
		expect(fake.requests).toHaveLength(1);
	});

	it('stops with sent 0 once the overall timeout passes, never polling past it', async () => {
		seedHandle();
		const fake = fakeFetch(
			() =>
				new Promise<Reply>((resolve) =>
					setTimeout(() => resolve({ status: 200, body: { sent: 0 } }), 10)
				)
		);

		const started = Date.now();
		const result = await makeClient(fake).waitForSent({ topicId: 'topic-1', timeoutMs: 60 });

		expect(result).toEqual({ ok: true, value: { sent: 0 } });
		expect(Date.now() - started).toBeLessThan(1000);
		for (const req of fake.requests) {
			expect(
				Number(new URL(`${SERVER}${req.path}`).searchParams.get('timeoutMs'))
			).toBeLessThanOrEqual(60);
		}
	});

	it('keeps polling with no overall limit when timeoutMs is 0', async () => {
		seedHandle();
		const fake = fakeFetch(sentAfter([0, 0, 0, 0, 2]));

		expect(await makeClient(fake).waitForSent({ topicId: 'topic-1', timeoutMs: 0 })).toEqual({
			ok: true,
			value: { sent: 2 }
		});
	});

	it('stops with sent 0 when the signal aborts a poll in flight', async () => {
		seedHandle();
		const fake = fakeFetch(() => 'hang');
		const controller = new AbortController();
		setTimeout(() => controller.abort(), 20);

		const result = await makeClient(fake, { requestTimeoutMs: 60_000 }).waitForSent({
			topicId: 'topic-1',
			signal: controller.signal
		});

		expect(result).toEqual({ ok: true, value: { sent: 0 } });
		expect(fake.requests).toHaveLength(1);
	});

	it('stops with sent 0 when the signal aborts a backoff sleep', async () => {
		seedHandle();
		const fake = fakeFetch(() => 'refuse');
		const controller = new AbortController();
		setTimeout(() => controller.abort(), 20);
		const client = createClient({
			env: {},
			configDir,
			fetch: fake.fetch,
			requestTimeoutMs: 100
		});

		const started = Date.now();
		const result = await client.waitForSent({ topicId: 'topic-1', signal: controller.signal });

		expect(result).toEqual({ ok: true, value: { sent: 0 } });
		expect(Date.now() - started).toBeLessThan(900);
	});

	it('does not poll when the signal has already aborted', async () => {
		seedHandle();
		const fake = fakeFetch(sentAfter([1]));

		const result = await makeClient(fake).waitForSent({
			topicId: 'topic-1',
			signal: AbortSignal.abort()
		});

		expect(result).toEqual({ ok: true, value: { sent: 0 } });
		expect(fake.requests).toHaveLength(0);
	});
});

describe('methods never reject', () => {
	it('resolve with ok:false when the transport throws on every call', async () => {
		seedHandle();
		const fetchFn = vi.fn(() => {
			throw new Error('kaboom');
		}) as unknown as typeof fetch;
		const client = createClient({ env: {}, configDir, fetch: fetchFn, sleep: async () => {} });
		const t = { topicId: 'topic-1' };

		const results = await Promise.all([
			client.openTopic({ title: 'x', cwd: tempDir() }),
			client.openTopic(t),
			client.getTopic(t),
			client.putNodes({ ...t, nodes: [] }),
			client.removeNodes({ ...t, paths: [] }),
			client.moveNode({ ...t, from: 'a', to: 'b' }),
			client.updateTopic(t),
			client.pullNotes(t),
			client.resolveNotes({ ...t, notes: [] }),
			client.waitForSent({ ...t, timeoutMs: 30 }),
			client.addNote({ ...t, anchor: { path: null }, intent: 'accept' }),
			client.send(t)
		]);

		for (const result of results.filter((r) => r !== results[9])) {
			expect(result).toEqual({ ok: false, warning: UNREACHABLE_WARNING });
		}
		expect(results[9]).toEqual({ ok: true, value: { sent: 0 } });
		expect(await client.discover()).toBeNull();
	});
});

describe('doctor', () => {
	it('reports the pinned server, its probe and the registry entry for this repo', async () => {
		const cwd = tempDir();
		seedFile('projects.json', {
			'http://pinned.test': {
				[cwd]: {
					projectId: 'proj-1',
					writeKey: 'bw_1',
					name: 'repo',
					projectUrl: 'http://pinned.test/p/proj-1'
				}
			}
		});
		const client = makeClient(
			fakeFetch(() => healthy('1.2.3')),
			{ env: { BERYL_URL: 'http://pinned.test/' } }
		);

		expect(await client.doctor({ cwd })).toEqual({
			configDir,
			pinned: 'http://pinned.test',
			probes: [{ server: 'http://pinned.test', ok: true, version: '1.2.3' }],
			server: 'http://pinned.test',
			repoKey: cwd,
			registered: { projectId: 'proj-1', name: 'repo' },
			registryError: null
		});
	});

	it('reports a null server when every candidate is down', async () => {
		const client = makeClient(
			fakeFetch(() => 'refuse'),
			{
				candidates: ['http://a.test', 'http://b.test']
			}
		);

		expect(await client.doctor({ cwd: tempDir() })).toMatchObject({
			pinned: null,
			probes: [
				{ server: 'http://a.test', ok: false },
				{ server: 'http://b.test', ok: false }
			],
			server: null,
			registered: null,
			registryError: null
		});
	});

	it('names a damaged registry', async () => {
		writeRaw('projects.json', 'nope');
		const client = makeClient(fakeFetch(() => healthy()));

		expect((await client.doctor({ cwd: tempDir() })).registryError).toBe(
			`${path.join(configDir, 'projects.json')} is not a JSON object; fix or delete it`
		);
	});
});

describe('repoIdentity and gitRefs', () => {
	it('keys a git repo by its common .git dir and names it after the repo dir', async () => {
		const repo = tempDir();
		git(repo, ['init', '-q']);
		git(repo, ['commit', '-q', '--allow-empty', '-m', 'init']);
		fs.mkdirSync(path.join(repo, 'sub'));

		const expected = { repoKey: path.join(repo, '.git'), name: path.basename(repo) };
		expect(await repoIdentity(repo)).toEqual(expected);
		expect(await repoIdentity(path.join(repo, 'sub'))).toEqual(expected);
	});

	it('gives a git worktree the key and name of its main repo', async () => {
		const repo = tempDir();
		git(repo, ['init', '-q']);
		git(repo, ['commit', '-q', '--allow-empty', '-m', 'init']);
		const worktree = path.join(tempDir(), 'wt');
		git(repo, ['worktree', 'add', '-q', '--detach', worktree]);

		expect(await repoIdentity(worktree)).toEqual({
			repoKey: path.join(repo, '.git'),
			name: path.basename(repo)
		});
	});

	it('falls back to the realpath and basename outside git', async () => {
		const dir = tempDir();

		expect(await repoIdentity(dir)).toEqual({ repoKey: dir, name: path.basename(dir) });
	});

	it('reads the origin remote and checked-out branch, and nothing outside git', async () => {
		const repo = tempDir();
		git(repo, ['init', '-q', '-b', 'topic/x']);
		git(repo, ['remote', 'add', 'origin', 'https://github.com/me/beryl.git']);

		expect(await gitRefs(repo)).toEqual({ repo: 'me/beryl', branch: 'topic/x' });
		expect(await gitRefs(tempDir())).toEqual({ repo: undefined, branch: undefined });
	});

	it.each([
		['git@github.com:me/beryl.git', 'me/beryl'],
		['https://github.com/me/beryl', 'me/beryl'],
		['https://gitlab.example.com/group/repo.git/', 'group/repo'],
		['ssh://git@host:22/owner/name.git', 'owner/name']
	])('reads %s as %s', (remote, repo) => {
		expect(repoFromRemote(remote)).toBe(repo);
	});
});
