import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { PalantirClient, Pulled, Snapshot } from '@palantir/client';
import { run } from './run.ts';
import { USAGE, formatDuration, parseDuration, UsageError } from './args.ts';

const UNREACHABLE = 'palantir unreachable — continuing without the board';
const T = '2026-10-24T00:00:00.000Z';
const URL = 'http://h/p/proj-1/t/topic-1';

const SNAPSHOT: Snapshot = {
	project: { id: 'proj-1', name: 'repo', createdAt: T, lastWriteAt: T },
	topic: {
		id: 'topic-1',
		projectId: 'proj-1',
		title: 'Retries',
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
	},
	nodes: [
		{
			topicId: 'topic-1',
			path: 'storage',
			parentPath: null,
			key: 'storage',
			depth: 1,
			position: 0,
			kind: 'area',
			status: 'open',
			title: 'Storage',
			gist: '',
			body: 'the body',
			recommendation: '',
			answer: '',
			rank: null,
			edges: [],
			widgets: [],
			sources: [],
			gistStale: false,
			createdAt: T,
			updatedAt: T,
			statusSince: T
		}
	],
	notes: [],
	lastSeq: 3
};

function fakeClient() {
	return {
		discover: vi.fn(),
		openTopic: vi.fn(),
		getTopic: vi.fn(),
		putNodes: vi.fn(),
		removeNodes: vi.fn(),
		moveNode: vi.fn(),
		updateTopic: vi.fn(),
		pullNotes: vi.fn(),
		resolveNotes: vi.fn(),
		waitForSent: vi.fn(),
		addNote: vi.fn(),
		send: vi.fn(),
		topicUrl: vi.fn(),
		doctor: vi.fn()
	};
}

type FakeClient = ReturnType<typeof fakeClient>;

async function invoke(argv: string[], client: FakeClient, stdin = '') {
	const out: string[] = [];
	const err: string[] = [];
	const code = await run(argv, {
		stdout: (s) => out.push(s),
		stderr: (s) => err.push(s),
		client: client as unknown as PalantirClient,
		readStdin: async () => stdin
	});
	return { code, stdout: out.join('\n'), stderr: err.join('\n') };
}

const tmpDirs: string[] = [];

function tmpJson(data: unknown, raw?: string): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'palantir-cli-'));
	tmpDirs.push(dir);
	const file = path.join(dir, 'nodes.json');
	fs.writeFileSync(file, raw ?? JSON.stringify(data));
	return file;
}

afterEach(() => {
	for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

const ok = (value: unknown) => ({ ok: true, value });

describe('open', () => {
	const opened = ok({
		topicId: 'topic-1',
		url: URL,
		noteUrl: `${URL}#nk=pn_1`,
		projectUrl: 'http://h/p/proj-1',
		server: 'http://h',
		projectId: 'proj-1',
		createdProject: true,
		resumed: false
	});

	it('prints "<topicId> <url> <noteUrl>" and exits 0', async () => {
		const client = fakeClient();
		client.openTopic.mockResolvedValue(opened);

		const result = await invoke(['open', 'Retries'], client);

		expect(result).toEqual({
			code: 0,
			stdout: `topic-1 ${URL} ${URL}#nk=pn_1`,
			stderr: ''
		});
	});

	it('passes every flag, the agent and the nodes file to openTopic', async () => {
		const client = fakeClient();
		client.openTopic.mockResolvedValue(opened);
		const file = tmpJson([{ path: 'storage', kind: 'area' }]);

		await invoke(
			[
				'open',
				'Retries',
				'--destination',
				'A spec',
				'--summary',
				'S',
				'--project',
				'Billing',
				'--repo',
				'o/r',
				'--branch',
				'b',
				'--tool',
				'codex',
				'--model',
				'gpt',
				'--effort',
				'high',
				'--file',
				file,
				'--cwd',
				'/repo'
			],
			client
		);

		expect(client.openTopic).toHaveBeenCalledWith({
			title: 'Retries',
			topicId: undefined,
			destination: 'A spec',
			summary: 'S',
			project: 'Billing',
			repo: 'o/r',
			branch: 'b',
			agent: { tool: 'codex', model: 'gpt', effort: 'high' },
			nodes: [{ path: 'storage', kind: 'area' }],
			cwd: '/repo'
		});
	});

	it('resumes with --topic and no title', async () => {
		const client = fakeClient();
		client.openTopic.mockResolvedValue(opened);

		const result = await invoke(['open', '--topic', 'topic-1'], client);

		expect(result.code).toBe(0);
		expect(client.openTopic).toHaveBeenCalledWith(
			expect.objectContaining({ topicId: 'topic-1', title: undefined, agent: undefined })
		);
	});

	it.each([
		['no title and no --topic', ['open']],
		['both a title and --topic', ['open', 'Retries', '--topic', 'topic-1']],
		['two titles', ['open', 'a', 'b']],
		['an unknown flag', ['open', 'Retries', '--colour', 'red']]
	])('exits 2 with usage for %s', async (_label, argv) => {
		const client = fakeClient();

		const result = await invoke(argv, client);

		expect(result.code).toBe(2);
		expect(result.stderr).toContain(USAGE);
		expect(client.openTopic).not.toHaveBeenCalled();
	});

	it('prints a warning on stderr and still exits 0', async () => {
		const client = fakeClient();
		client.openTopic.mockResolvedValue({ ok: false, warning: UNREACHABLE });

		expect(await invoke(['open', 'Retries'], client)).toEqual({
			code: 0,
			stdout: '',
			stderr: `palantir: ${UNREACHABLE}`
		});
	});
});

describe('get', () => {
	const read = ok({ snapshot: SNAPSHOT, url: URL, noteUrl: `${URL}#nk=x` });

	it('prints the outline', async () => {
		const client = fakeClient();
		client.getTopic.mockResolvedValue(read);

		const result = await invoke(['get', 'topic-1'], client);

		expect(client.getTopic).toHaveBeenCalledWith({ topicId: 'topic-1' });
		expect(result.stdout).toBe(
			[
				'Topic "Retries" (open)',
				'storage [area/open] Storage',
				'Notes: 0 queued, 0 delivered and unresolved.'
			].join('\n')
		);
	});

	it('adds detail with --full and limits to a subtree with --path', async () => {
		const client = fakeClient();
		client.getTopic.mockResolvedValue(read);

		expect((await invoke(['get', 'topic-1', '--full'], client)).stdout).toContain(
			'    body: the body'
		);
		expect((await invoke(['get', 'topic-1', '--path', 'nope'], client)).stdout).toContain(
			'No node nope.'
		);
	});

	it('prints the Snapshot as JSON with --json', async () => {
		const client = fakeClient();
		client.getTopic.mockResolvedValue(read);

		expect(JSON.parse((await invoke(['get', 'topic-1', '--json'], client)).stdout)).toEqual(
			SNAPSHOT
		);
	});
});

describe('put', () => {
	const written = ok({ nodes: [SNAPSHOT.nodes[0], SNAPSHOT.nodes[0]] });
	const nodes = [
		{ path: 'a', kind: 'fact' },
		{ path: 'b', kind: 'fog' }
	];

	it.each([
		['a node list file', () => ['--file', tmpJson(nodes)], ''],
		['a { nodes } file', () => ['--file', tmpJson({ nodes })], ''],
		['stdin', () => [], JSON.stringify(nodes)],
		['{ nodes } on stdin', () => [], JSON.stringify({ nodes })]
	])('writes the nodes from %s', async (_label, flags, stdin) => {
		const client = fakeClient();
		client.putNodes.mockResolvedValue(written);

		const result = await invoke(['put', 'topic-1', ...flags()], client, stdin);

		expect(client.putNodes).toHaveBeenCalledWith({ topicId: 'topic-1', nodes });
		expect(result).toEqual({ code: 0, stdout: '2 nodes written', stderr: '' });
	});

	it.each([
		['malformed JSON', () => ['--file', tmpJson(null, '{nope')], /cannot read nodes from/],
		['a missing file', () => ['--file', '/no/such/nodes.json'], /cannot read nodes from/],
		['an object without nodes', () => ['--file', tmpJson({ path: 'a' })], /neither a node list/]
	])('exits 2 for %s without writing', async (_label, flags, message) => {
		const client = fakeClient();

		const result = await invoke(['put', 'topic-1', ...flags()], client);

		expect(result.code).toBe(2);
		expect(result.stderr).toMatch(message);
		expect(client.putNodes).not.toHaveBeenCalled();
	});
});

describe('rm and mv', () => {
	it('removes every path and prints each removed one on its own line', async () => {
		const client = fakeClient();
		client.removeNodes.mockResolvedValue(ok({ removed: ['a/b', 'a', 'c'] }));

		const result = await invoke(['rm', 'topic-1', 'a', 'c'], client);

		expect(client.removeNodes).toHaveBeenCalledWith({ topicId: 'topic-1', paths: ['a', 'c'] });
		expect(result.stdout).toBe('a/b\na\nc');
	});

	it('needs at least one path', async () => {
		expect((await invoke(['rm', 'topic-1'], fakeClient())).code).toBe(2);
	});

	it('prints "<from> -> <to>" for each moved path', async () => {
		const client = fakeClient();
		client.moveNode.mockResolvedValue(
			ok({
				moved: [
					{ from: 'a', to: 'x' },
					{ from: 'a/b', to: 'x/b' }
				]
			})
		);

		const result = await invoke(['mv', 'topic-1', 'a', 'x'], client);

		expect(client.moveNode).toHaveBeenCalledWith({ topicId: 'topic-1', from: 'a', to: 'x' });
		expect(result.stdout).toBe('a -> x\na/b -> x/b');
	});
});

describe('topic', () => {
	const updated = ok({ topic: { ...SNAPSHOT.topic, status: 'closed' } });

	it('passes the flags and prints "<topicId> <status>"', async () => {
		const client = fakeClient();
		client.updateTopic.mockResolvedValue(updated);

		const result = await invoke(
			[
				'topic',
				'topic-1',
				'--title',
				't',
				'--destination',
				'd',
				'--summary',
				's',
				'--status',
				'closed',
				'--current',
				'storage/engine'
			],
			client
		);

		expect(client.updateTopic).toHaveBeenCalledWith({
			topicId: 'topic-1',
			title: 't',
			destination: 'd',
			summary: 's',
			status: 'closed',
			current: 'storage/engine'
		});
		expect(result.stdout).toBe('topic-1 closed');
	});

	it('clears the current Question with --no-current', async () => {
		const client = fakeClient();
		client.updateTopic.mockResolvedValue(updated);

		await invoke(['topic', 'topic-1', '--no-current'], client);

		expect(client.updateTopic).toHaveBeenCalledWith(
			expect.objectContaining({ topicId: 'topic-1', current: null })
		);
	});

	it.each([
		['a bad status', ['--status', 'done']],
		['both --current and --no-current', ['--current', 'a', '--no-current']]
	])('exits 2 for %s', async (_label, flags) => {
		const client = fakeClient();

		expect((await invoke(['topic', 'topic-1', ...flags], client)).code).toBe(2);
		expect(client.updateTopic).not.toHaveBeenCalled();
	});
});

describe('pull and resolve', () => {
	it('prints the pulled notes as formatPulled', async () => {
		const client = fakeClient();
		const pulled: Pulled = { notes: [], unresolved: [], context: {}, stale: [] };
		client.pullNotes.mockResolvedValue(ok(pulled));

		const result = await invoke(['pull', 'topic-1'], client);

		expect(client.pullNotes).toHaveBeenCalledWith({ topicId: 'topic-1' });
		expect(result.stdout).toBe('palantir: no new notes on the board for topic topic-1.');
	});

	it('resolves one note with its reply and changed paths', async () => {
		const client = fakeClient();
		client.resolveNotes.mockResolvedValue(ok({ notes: [{ id: 'n1' }] }));

		const result = await invoke(
			['resolve', 'topic-1', 'n1', '--reply', 'took it', '--changed', 'a', '--changed', 'b'],
			client
		);

		expect(client.resolveNotes).toHaveBeenCalledWith({
			topicId: 'topic-1',
			notes: [{ id: 'n1', reply: 'took it', changed: ['a', 'b'] }]
		});
		expect(result.stdout).toBe('resolved n1');
	});
});

describe('note, send and url', () => {
	const added = ok({ note: { id: 'n1', status: 'queued' } });

	it('adds a Note pinned to an element and prints "<noteId> <status>"', async () => {
		const client = fakeClient();
		client.addNote.mockResolvedValue(added);

		const result = await invoke(
			[
				'note',
				'topic-1',
				'comment',
				'should be unique',
				'--path',
				'storage/schema',
				'--widget',
				'tables',
				'--element',
				'users.email',
				'--author',
				'Sam'
			],
			client
		);

		expect(client.addNote).toHaveBeenCalledWith({
			topicId: 'topic-1',
			anchor: { path: 'storage/schema', widget: 'tables', element: 'users.email' },
			intent: 'comment',
			text: 'should be unique',
			author: 'Sam'
		});
		expect(result.stdout).toBe('n1 queued');
	});

	it('pins a Note without --path to the Topic', async () => {
		const client = fakeClient();
		client.addNote.mockResolvedValue(added);

		await invoke(['note', 'topic-1', 'accept'], client);

		expect(client.addNote).toHaveBeenCalledWith({
			topicId: 'topic-1',
			anchor: { path: null },
			intent: 'accept',
			text: undefined,
			author: undefined
		});
	});

	it.each([
		['an unknown intent', ['note', 'topic-1', 'shout', 'hey']],
		['--widget without --path', ['note', 'topic-1', 'comment', 'x', '--widget', 'w']],
		[
			'--element without --widget',
			['note', 'topic-1', 'comment', 'x', '--path', 'a', '--element', 'e']
		]
	])('exits 2 for %s', async (_label, argv) => {
		const client = fakeClient();

		expect((await invoke(argv, client)).code).toBe(2);
		expect(client.addNote).not.toHaveBeenCalled();
	});

	it('prints "sent <n>"', async () => {
		const client = fakeClient();
		client.send.mockResolvedValue(ok({ sent: 3 }));

		expect((await invoke(['send', 'topic-1'], client)).stdout).toBe('sent 3');
	});

	it('prints the Share link, or the Private link with --private', async () => {
		const client = fakeClient();
		client.topicUrl.mockResolvedValue(ok({ url: URL }));

		expect((await invoke(['url', 'topic-1'], client)).stdout).toBe(URL);
		await invoke(['url', 'topic-1', '--private'], client);

		expect(client.topicUrl.mock.calls).toEqual([
			[{ topicId: 'topic-1', private: undefined }],
			[{ topicId: 'topic-1', private: true }]
		]);
	});
});

describe('doctor and usage', () => {
	it('prints the doctor report', async () => {
		const client = fakeClient();
		client.doctor.mockResolvedValue({
			configDir: '/c/palantir',
			pinned: null,
			probes: [{ server: 'http://localhost:3270', ok: true, version: '0.1.0' }],
			server: 'http://localhost:3270',
			repoKey: '/repo/.git',
			registered: null,
			registryError: null
		});

		expect((await invoke(['doctor'], client)).stdout).toBe(
			[
				'config dir: /c/palantir',
				'pinned: none',
				'probes:',
				'  http://localhost:3270 ok (v0.1.0)',
				'server: http://localhost:3270',
				'repo: /repo/.git',
				'registered: no',
				'registry: ok'
			].join('\n')
		);
	});

	it.each([[[]], [['frobnicate']], [['send']], [['send', 'a', 'b']]])(
		'exits 2 with usage for %j',
		async (argv) => {
			const result = await invoke(argv, fakeClient());

			expect(result.code).toBe(2);
			expect(result.stderr).toContain(USAGE);
		}
	);

	it('prints usage on stdout for help', async () => {
		expect(await invoke(['help'], fakeClient())).toEqual({ code: 0, stdout: USAGE, stderr: '' });
	});

	it('reports a thrown client error on stderr and still exits 0', async () => {
		const client = fakeClient();
		client.send.mockRejectedValue(new Error('boom'));

		expect(await invoke(['send', 'topic-1'], client)).toEqual({
			code: 0,
			stdout: '',
			stderr: 'palantir: boom'
		});
	});
});

describe('durations', () => {
	it.each([
		['90s', 90_000],
		['30m', 1_800_000],
		['12h', 43_200_000],
		['0', 0]
	])('reads %s as %i ms', (text, ms) => {
		expect(parseDuration(text)).toBe(ms);
	});

	it.each(['', '12', '1d', '-5s', '1.5h', 'h'])('rejects %j', (text) => {
		expect(() => parseDuration(text)).toThrow(UsageError);
	});

	it.each([
		[43_200_000, '12h'],
		[1_800_000, '30m'],
		[90_000, '90s'],
		[1500, '2s']
	])('formats %i ms as %s', (ms, text) => {
		expect(formatDuration(ms)).toBe(text);
	});
});
