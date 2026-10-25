import { spawn } from 'node:child_process';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
	EDGE_RELS,
	NODE_KINDS,
	NODE_STATUSES,
	WIDGET_TYPES,
	createClient,
	formatOutline,
	formatPulled,
	type AgentInfo,
	type EdgeRel,
	type NodeKind,
	type NodeStatus,
	type PalantirClient,
	type Result,
	type WidgetType
} from '@palantir/client';
import { z } from 'zod';

const oneOf = <T extends string>(values: readonly T[]) => z.enum(values as [T, ...T[]]);

const agent = z
	.object({
		tool: z.string().optional(),
		model: z.string().optional(),
		effort: z.string().optional()
	})
	.describe('Who is grilling: tool (claude-code, codex), model id and effort level.');

const edge = z.object({
	rel: oneOf<EdgeRel>(EDGE_RELS),
	to: z.string().describe('A Path in the same Topic.'),
	label: z.string().optional()
});

const source = z.object({
	label: z.string().optional(),
	url: z.string().optional(),
	file: z.string().optional().describe('Repo-relative path.'),
	line: z.number().int().positive().optional()
});

const widget = z.object({
	key: z.string(),
	type: oneOf<WidgetType>(WIDGET_TYPES),
	title: z.string().optional(),
	data: z.unknown().describe("Shaped per `type`, as the palantir skill's WIDGETS.md describes.")
});

const nodeInput = z.object({
	path: z.string().describe('Keys joined by `/`, such as `storage/engine`.'),
	kind: oneOf<NodeKind>(NODE_KINDS).optional().describe('Required when the Node is new.'),
	status: oneOf<NodeStatus>(NODE_STATUSES).optional(),
	title: z.string().optional(),
	gist: z.string().optional(),
	body: z.string().optional(),
	recommendation: z.string().optional(),
	answer: z.string().optional(),
	rank: z.number().int().nonnegative().nullable().optional(),
	edges: z.array(edge).optional().describe('Replaces the whole list.'),
	widgets: z.array(widget).optional().describe('Replaces the whole list.'),
	sources: z.array(source).optional().describe('Replaces the whole list.'),
	position: z.number().int().optional()
});

function toolFromClient(name: string | undefined): string | undefined {
	if (!name) return undefined;
	if (/claude/i.test(name)) return 'claude-code';
	if (/codex/i.test(name)) return 'codex';
	return undefined;
}

const text = (body: string): CallToolResult => ({ content: [{ type: 'text', text: body }] });

function respond<T>(
	result: Result<T>,
	render: (value: T) => string = JSON.stringify
): CallToolResult {
	return text(result.ok ? render(result.value) : `palantir: ${result.warning}`);
}

export type Opener = (url: string) => void;

// Fire and forget: a missing opener or display must never surface to the agent.
export function openInBrowser(url: string): void {
	if (process.env.PALANTIR_OPEN === '0') return;
	const [cmd, args] =
		process.platform === 'darwin'
			? ['open', [url]]
			: process.platform === 'win32'
				? ['cmd', ['/c', 'start', '', url]]
				: ['xdg-open', [url]];
	try {
		const child = spawn(cmd, args, { detached: true, stdio: 'ignore' });
		child.on('error', () => {});
		child.unref();
	} catch {
		return;
	}
}

export function createServer(
	client: PalantirClient = createClient(),
	open: Opener = openInBrowser
): McpServer {
	const server = new McpServer({ name: 'palantir', version: '0.1.0' });
	const opened = new Set<string>();

	server.registerTool(
		'open_topic',
		{
			description:
				"Call this when a grill starts, to open its Topic on this repo's palantir board (or pass `topicId` to resume one), then print the returned `noteUrl` to the user as their private link.",
			inputSchema: {
				title: z.string().optional().describe('Required unless `topicId` is given.'),
				destination: z
					.string()
					.optional()
					.describe('What the grill is finding its way to, in one or two lines.'),
				summary: z.string().optional(),
				nodes: z.array(nodeInput).optional(),
				agent: agent.optional(),
				repo: z.string().optional(),
				branch: z.string().optional(),
				project: z
					.string()
					.optional()
					.describe("Human name for this repo's project; renames it if it differs."),
				topicId: z.string().optional().describe('Resume this Topic instead of creating one.'),
				cwd: z.string().optional()
			}
		},
		async (args) => {
			const tool = args.agent?.tool ?? toolFromClient(server.server.getClientVersion()?.name);
			const withTool: AgentInfo | undefined = tool ? { ...args.agent, tool } : args.agent;
			const result = await client.openTopic(withTool ? { ...args, agent: withTool } : args);
			if (result.ok && !opened.has(result.value.topicId)) {
				opened.add(result.value.topicId);
				open(result.value.noteUrl);
			}
			return respond(result);
		}
	);

	server.registerTool(
		'get_topic',
		{
			description:
				'Read a Topic as an outline, with bodies and widgets (`full`), or as its raw Snapshot (`json`); call it after context compaction before writing again.',
			inputSchema: {
				topicId: z.string(),
				path: z.string().optional().describe('Show only this Node and its subtree.'),
				detail: z.enum(['outline', 'full', 'json']).optional()
			}
		},
		async ({ topicId, path, detail }) =>
			respond(await client.getTopic({ topicId }), ({ snapshot }) =>
				detail === 'json'
					? JSON.stringify(snapshot)
					: formatOutline(snapshot, { path, detail: detail ?? 'outline' })
			)
	);

	server.registerTool(
		'put_nodes',
		{
			description:
				"Create or update Nodes by path (missing ancestors become areas; `kind` is required on create), with widget shapes as the palantir skill's WIDGETS.md describes.",
			inputSchema: { topicId: z.string(), nodes: z.array(nodeInput) }
		},
		async (args) =>
			respond(await client.putNodes(args), ({ nodes }) =>
				JSON.stringify({
					written: nodes.map(({ path, kind, status, gistStale }) => ({
						path,
						kind,
						status,
						gistStale
					}))
				})
			)
	);

	server.registerTool(
		'remove_nodes',
		{
			description: 'Remove Nodes by path, each with its whole subtree.',
			inputSchema: { topicId: z.string(), paths: z.array(z.string()) }
		},
		async (args) => respond(await client.removeNodes(args))
	);

	server.registerTool(
		'move_node',
		{
			description:
				'Re-path a Node and its subtree from `from` to `to`; edges, note anchors and the current Question follow it.',
			inputSchema: { topicId: z.string(), from: z.string(), to: z.string() }
		},
		async (args) => respond(await client.moveNode(args))
	);

	server.registerTool(
		'update_topic',
		{
			description:
				"Set the Topic's title, destination, summary or `current` Question (null clears it), and close it with status `closed` when the grill concludes.",
			inputSchema: {
				topicId: z.string(),
				title: z.string().optional(),
				destination: z.string().optional(),
				summary: z.string().optional(),
				status: z.enum(['open', 'closed']).optional(),
				current: z
					.string()
					.nullable()
					.optional()
					.describe('Path of the Question you are asking now; null when none.'),
				agent: agent.optional()
			}
		},
		async (args) => respond(await client.updateTopic(args))
	);

	server.registerTool(
		'pull_notes',
		{
			description:
				'Take the notes people left on the board into your context, which marks them delivered, then resolve each with resolve_notes.',
			inputSchema: { topicId: z.string() }
		},
		async ({ topicId }) =>
			respond(await client.pullNotes({ topicId }), (pulled) =>
				formatPulled(pulled, { id: topicId })
			)
	);

	server.registerTool(
		'resolve_notes',
		{
			description:
				'Close delivered notes by id, each with a one-line reply and the paths you changed for it.',
			inputSchema: {
				topicId: z.string(),
				notes: z.array(
					z.object({
						id: z.string(),
						reply: z.string().optional(),
						changed: z.array(z.string()).optional()
					})
				)
			}
		},
		async (args) =>
			respond(await client.resolveNotes(args), ({ notes }) =>
				JSON.stringify({ resolved: notes.map((n) => n.id) })
			)
	);

	return server;
}
