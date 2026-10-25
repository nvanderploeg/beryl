import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import type { Node, BerylClient, Pulled, Snapshot, Topic } from '@beryl/client';
import { createServer, type Opener } from './server.ts';

type Method =
	| 'openTopic'
	| 'getTopic'
	| 'putNodes'
	| 'removeNodes'
	| 'moveNode'
	| 'updateTopic'
	| 'pullNotes'
	| 'resolveNotes';

type FakeClient = Record<Method, Mock>;

const T = '2026-10-24T00:00:00.000Z';
const SERVER = 'http://localhost:3270';
const URL = `${SERVER}/p/proj-1/t/topic-1`;

const TOPIC: Topic = {
	id: 'topic-1',
	projectId: 'proj-1',
	title: 'Retries',
	destination: 'A spec',
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

const NODE: Node = {
	topicId: 'topic-1',
	path: 'storage',
	parentPath: null,
	key: 'storage',
	depth: 1,
	position: 0,
	kind: 'area',
	status: 'open',
	title: 'Storage',
	gist: 'Where it lives.',
	body: 'the body',
	recommendation: '',
	answer: '',
	rank: null,
	edges: [],
	widgets: [],
	sources: [],
	gistStale: true,
	createdAt: T,
	updatedAt: T,
	statusSince: T
};

const SNAPSHOT: Snapshot = {
	project: { id: 'proj-1', name: 'repo', createdAt: T, lastWriteAt: T },
	topic: TOPIC,
	nodes: [NODE],
	notes: [],
	lastSeq: 4
};

const PULLED: Pulled = { notes: [], unresolved: [], context: {}, stale: [] };

const OPENED = {
	topicId: 'topic-1',
	url: URL,
	noteUrl: `${URL}#nk=bn_1`,
	projectUrl: `${SERVER}/p/proj-1`,
	server: SERVER,
	projectId: 'proj-1',
	createdProject: true,
	resumed: false
};

const ok = (value: unknown) => ({ ok: true, value });
const notOk = (warning: string) => ({ ok: false, warning });

function fakeClient(): FakeClient {
	return {
		openTopic: vi.fn(async () => ok(OPENED)),
		getTopic: vi.fn(async () => ok({ snapshot: SNAPSHOT, url: URL, noteUrl: `${URL}#nk=bn_1` })),
		putNodes: vi.fn(async () => ok({ nodes: [NODE] })),
		removeNodes: vi.fn(async () => ok({ removed: ['storage'] })),
		moveNode: vi.fn(async () => ok({ moved: [{ from: 'a', to: 'b' }] })),
		updateTopic: vi.fn(async () => ok({ topic: TOPIC })),
		pullNotes: vi.fn(async () => ok(PULLED)),
		resolveNotes: vi.fn(async () => ok({ notes: [{ id: 'n1' }, { id: 'n2' }] }))
	};
}

const closers: Array<() => Promise<void>> = [];

afterEach(async () => {
	while (closers.length > 0) await closers.pop()?.();
});

async function connect(
	client: FakeClient = fakeClient(),
	clientName = 'test-agent',
	open: Opener = vi.fn()
) {
	const server = createServer(client as unknown as BerylClient, open);
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	const mcp = new Client({ name: clientName, version: '0.0.0' });
	await server.connect(serverTransport);
	await mcp.connect(clientTransport);
	closers.push(async () => {
		await mcp.close();
		await server.close();
	});
	return { mcp, client, open };
}

async function textOf(mcp: Client, name: string, args: Record<string, unknown>) {
	const result = await mcp.callTool({ name, arguments: args });
	expect(result.isError).toBeFalsy();
	const content = result.content as { type: string; text: string }[];
	expect(content).toHaveLength(1);
	expect(content[0].type).toBe('text');
	return content[0].text;
}

const TOOLS = [
	'get_topic',
	'move_node',
	'open_topic',
	'pull_notes',
	'put_nodes',
	'remove_nodes',
	'resolve_notes',
	'update_topic'
];

describe('tool listing', () => {
	it('identifies itself as the beryl server', async () => {
		const { mcp } = await connect();

		expect(mcp.getServerVersion()?.name).toBe('beryl');
	});

	it('lists exactly the eight beryl tools', async () => {
		const { mcp } = await connect();

		const { tools } = await mcp.listTools();

		expect(tools.map((t) => t.name).sort()).toEqual(TOOLS);
	});

	it('describes every tool in one sentence', async () => {
		const { mcp } = await connect();

		for (const tool of (await mcp.listTools()).tools) {
			const description = tool.description ?? '';
			expect(description, tool.name).toMatch(/^[A-Z].*\.$/);
			expect(description.split(/\.\s/), tool.name).toHaveLength(1);
		}
	});

	it('tells the agent when to open a topic and to print the noteUrl', async () => {
		const { mcp } = await connect();

		const { tools } = await mcp.listTools();
		const description = tools.find((t) => t.name === 'open_topic')?.description;

		expect(description).toMatch(/grill starts/);
		expect(description).toMatch(/noteUrl/);
	});

	it("points put_nodes at the skill's WIDGETS.md", async () => {
		const { mcp } = await connect();

		const { tools } = await mcp.listTools();

		expect(tools.find((t) => t.name === 'put_nodes')?.description).toMatch(/WIDGETS\.md/);
	});

	it.each([
		[
			'open_topic',
			[],
			[
				'agent',
				'branch',
				'cwd',
				'destination',
				'nodes',
				'project',
				'repo',
				'summary',
				'title',
				'topicId'
			]
		],
		['get_topic', ['topicId'], ['detail', 'path', 'topicId']],
		['put_nodes', ['nodes', 'topicId'], ['nodes', 'topicId']],
		['remove_nodes', ['paths', 'topicId'], ['paths', 'topicId']],
		['move_node', ['from', 'to', 'topicId'], ['from', 'to', 'topicId']],
		[
			'update_topic',
			['topicId'],
			['agent', 'current', 'destination', 'status', 'summary', 'title', 'topicId']
		],
		['pull_notes', ['topicId'], ['topicId']],
		['resolve_notes', ['notes', 'topicId'], ['notes', 'topicId']]
	])('%s declares the contract inputs', async (name, required, properties) => {
		const { mcp } = await connect();

		const tool = (await mcp.listTools()).tools.find((t) => t.name === name);

		expect([...(tool?.inputSchema.required ?? [])].sort()).toEqual([...required].sort());
		expect(Object.keys(tool?.inputSchema.properties ?? {}).sort()).toEqual([...properties].sort());
	});
});

describe('open_topic', () => {
	it('forwards every argument and answers with the openTopic value as JSON', async () => {
		const { mcp, client } = await connect();
		const args = {
			title: 'Retries',
			destination: 'A spec',
			summary: 's',
			nodes: [{ path: 'storage', kind: 'area', title: 'Storage' }],
			agent: { tool: 'codex', model: 'gpt', effort: 'high' },
			repo: 'o/r',
			branch: 'b',
			project: 'Billing',
			cwd: '/repo'
		};

		expect(await textOf(mcp, 'open_topic', args)).toBe(JSON.stringify(OPENED));
		expect(client.openTopic).toHaveBeenCalledExactlyOnceWith(args);
	});

	it('forwards a resume by topicId alone', async () => {
		const { mcp, client } = await connect();

		await mcp.callTool({ name: 'open_topic', arguments: { topicId: 'topic-1' } });

		expect(client.openTopic).toHaveBeenCalledWith({ topicId: 'topic-1' });
	});

	it.each([
		['claude-code', 'claude-code'],
		['Claude Desktop', 'claude-code'],
		['codex-mcp-client', 'codex']
	])('names the tool from an MCP client called %s', async (clientName, tool) => {
		const { mcp, client } = await connect(fakeClient(), clientName);

		await mcp.callTool({ name: 'open_topic', arguments: { title: 't', agent: { model: 'm' } } });

		expect(client.openTopic).toHaveBeenCalledWith({ title: 't', agent: { model: 'm', tool } });
	});

	it('keeps an explicit tool and adds none for an unknown client', async () => {
		const named = await connect(fakeClient(), 'claude-code');
		await named.mcp.callTool({
			name: 'open_topic',
			arguments: { title: 't', agent: { tool: 'x' } }
		});
		expect(named.client.openTopic).toHaveBeenCalledWith({ title: 't', agent: { tool: 'x' } });

		const unknown = await connect(fakeClient(), 'some-editor');
		await unknown.mcp.callTool({ name: 'open_topic', arguments: { title: 't' } });
		expect(unknown.client.openTopic).toHaveBeenCalledWith({ title: 't' });
	});
});

describe('the other tools', () => {
	it('get_topic answers with the outline by default', async () => {
		const { mcp, client } = await connect();

		const text = await textOf(mcp, 'get_topic', { topicId: 'topic-1' });

		expect(client.getTopic).toHaveBeenCalledWith({ topicId: 'topic-1' });
		expect(text).toBe(
			[
				'Topic "Retries" (open)',
				'Destination: A spec',
				'storage [area/open]* Storage — Where it lives.',
				'Notes: 0 queued, 0 delivered and unresolved.'
			].join('\n')
		);
	});

	it('get_topic adds detail for full, narrows to a path, and gives the Snapshot for json', async () => {
		const { mcp } = await connect();

		expect(await textOf(mcp, 'get_topic', { topicId: 'topic-1', detail: 'full' })).toContain(
			'    body: the body'
		);
		expect(await textOf(mcp, 'get_topic', { topicId: 'topic-1', path: 'nope' })).toContain(
			'No node nope.'
		);
		expect(
			JSON.parse(await textOf(mcp, 'get_topic', { topicId: 'topic-1', detail: 'json' }))
		).toEqual(SNAPSHOT);
	});

	it('put_nodes passes widget data through unchecked and answers with what it wrote', async () => {
		const { mcp, client } = await connect();
		const nodes = [
			{
				path: 'storage/schema',
				kind: 'fact',
				rank: null,
				edges: [{ rel: 'relies_on', to: 'storage' }],
				sources: [{ file: 'db.ts', line: 3 }],
				widgets: [{ key: 'tables', type: 'schema', data: { anything: [1, { goes: true }] } }]
			}
		];

		const text = await textOf(mcp, 'put_nodes', { topicId: 'topic-1', nodes });

		expect(client.putNodes).toHaveBeenCalledWith({ topicId: 'topic-1', nodes });
		expect(JSON.parse(text)).toEqual({
			written: [{ path: 'storage', kind: 'area', status: 'open', gistStale: true }]
		});
	});

	it('remove_nodes, move_node and update_topic answer with their values as JSON', async () => {
		const { mcp, client } = await connect();

		expect(await textOf(mcp, 'remove_nodes', { topicId: 'topic-1', paths: ['storage'] })).toBe(
			JSON.stringify({ removed: ['storage'] })
		);
		expect(await textOf(mcp, 'move_node', { topicId: 'topic-1', from: 'a', to: 'b' })).toBe(
			JSON.stringify({ moved: [{ from: 'a', to: 'b' }] })
		);
		expect(
			await textOf(mcp, 'update_topic', { topicId: 'topic-1', current: null, status: 'closed' })
		).toBe(JSON.stringify({ topic: TOPIC }));

		expect(client.removeNodes).toHaveBeenCalledWith({ topicId: 'topic-1', paths: ['storage'] });
		expect(client.moveNode).toHaveBeenCalledWith({ topicId: 'topic-1', from: 'a', to: 'b' });
		expect(client.updateTopic).toHaveBeenCalledWith({
			topicId: 'topic-1',
			current: null,
			status: 'closed'
		});
	});

	it('pull_notes answers with formatPulled', async () => {
		const { mcp, client } = await connect();

		expect(await textOf(mcp, 'pull_notes', { topicId: 'topic-1' })).toBe(
			'beryl: no new notes on the board for topic topic-1.'
		);
		expect(client.pullNotes).toHaveBeenCalledWith({ topicId: 'topic-1' });
	});

	it('resolve_notes answers with the resolved ids', async () => {
		const { mcp, client } = await connect();
		const notes = [{ id: 'n1', reply: 'took it', changed: ['storage'] }, { id: 'n2' }];

		expect(await textOf(mcp, 'resolve_notes', { topicId: 'topic-1', notes })).toBe(
			JSON.stringify({ resolved: ['n1', 'n2'] })
		);
		expect(client.resolveNotes).toHaveBeenCalledWith({ topicId: 'topic-1', notes });
	});
});

describe('failures', () => {
	it.each([
		['open_topic', 'openTopic', { title: 'T' }],
		['get_topic', 'getTopic', { topicId: 'topic-1' }],
		['put_nodes', 'putNodes', { topicId: 'topic-1', nodes: [] }],
		['remove_nodes', 'removeNodes', { topicId: 'topic-1', paths: [] }],
		['move_node', 'moveNode', { topicId: 'topic-1', from: 'a', to: 'b' }],
		['update_topic', 'updateTopic', { topicId: 'topic-1' }],
		['pull_notes', 'pullNotes', { topicId: 'topic-1' }],
		['resolve_notes', 'resolveNotes', { topicId: 'topic-1', notes: [] }]
	] as const)('%s answers "beryl: <warning>" without isError', async (name, method, args) => {
		const warning = 'beryl unreachable — continuing without the board';
		const client = fakeClient();
		client[method].mockResolvedValueOnce(notOk(warning));
		const { mcp } = await connect(client);

		expect(await textOf(mcp, name, args)).toBe(`beryl: ${warning}`);
	});

	it.each([
		['get_topic', {}, 'getTopic'],
		['get_topic', { topicId: 't', detail: 'everything' }, 'getTopic'],
		['put_nodes', { topicId: 't', nodes: [{ path: 'a', kind: 'blob' }] }, 'putNodes'],
		['put_nodes', { topicId: 't', nodes: [{ path: 'a', rank: 1.5 }] }, 'putNodes'],
		[
			'put_nodes',
			{ topicId: 't', nodes: [{ path: 'a', widgets: [{ key: 'w', type: 'chart', data: 1 }] }] },
			'putNodes'
		],
		['update_topic', { topicId: 't', status: 'done' }, 'updateTopic'],
		['move_node', { topicId: 't', from: 'a' }, 'moveNode']
	] as const)('%s rejects %j without calling the client', async (name, args, method) => {
		const client = fakeClient();
		const { mcp } = await connect(client);

		const failed = await mcp.callTool({ name, arguments: args }).then(
			(result) => result.isError === true,
			(error) => {
				expect(error).toBeInstanceOf(McpError);
				expect((error as McpError).code).toBe(ErrorCode.InvalidParams);
				return true;
			}
		);

		expect(failed).toBe(true);
		expect(client[method]).not.toHaveBeenCalled();
	});
});

describe('board opener', () => {
	it('opens the noteUrl once open_topic succeeds', async () => {
		const open = vi.fn();
		const { mcp } = await connect(fakeClient(), 'test-agent', open);

		await mcp.callTool({ name: 'open_topic', arguments: { title: 'T' } });

		expect(open).toHaveBeenCalledExactlyOnceWith(`${URL}#nk=bn_1`);
	});

	it('opens a Topic only once per server, but each new Topic', async () => {
		const client = fakeClient();
		const open = vi.fn();
		const { mcp } = await connect(client, 'test-agent', open);

		await mcp.callTool({ name: 'open_topic', arguments: { title: 'T' } });
		await mcp.callTool({ name: 'open_topic', arguments: { topicId: 'topic-1' } });
		client.openTopic.mockResolvedValueOnce(
			ok({ ...OPENED, topicId: 'topic-2', noteUrl: 'http://x/t/topic-2#nk=bn_1' })
		);
		await mcp.callTool({ name: 'open_topic', arguments: { title: 'U' } });

		expect(open.mock.calls).toEqual([[`${URL}#nk=bn_1`], ['http://x/t/topic-2#nk=bn_1']]);
	});

	it('opens nothing when open_topic returns a warning, or on other tools', async () => {
		const client = fakeClient();
		client.openTopic.mockResolvedValueOnce(notOk('beryl unreachable'));
		const open = vi.fn();
		const { mcp } = await connect(client, 'test-agent', open);

		await mcp.callTool({ name: 'open_topic', arguments: { title: 'T' } });
		await mcp.callTool({ name: 'get_topic', arguments: { topicId: 'topic-1' } });
		await mcp.callTool({ name: 'pull_notes', arguments: { topicId: 'topic-1' } });

		expect(open).not.toHaveBeenCalled();
	});
});
