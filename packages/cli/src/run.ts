import { readFile } from 'node:fs/promises';
import {
	NOTE_INTENTS,
	createClient,
	formatOutline,
	formatPulled,
	type AgentInfo,
	type Anchor,
	type DoctorReport,
	type NodeInput,
	type NoteIntent,
	type SpeculumClient,
	type Result
} from '@speculum/client';
import { USAGE, UsageError, parse } from './args.ts';

export interface RunIo {
	stdout: (s: string) => void;
	stderr: (s: string) => void;
	client?: SpeculumClient;
	readStdin?: () => Promise<string>;
}

class InputError extends Error {}

async function readProcessStdin(): Promise<string> {
	let raw = '';
	for await (const chunk of process.stdin) raw += chunk;
	return raw;
}

async function readNodes(
	file: string | undefined,
	readStdin: () => Promise<string>
): Promise<NodeInput[]> {
	const source = file ?? 'stdin';
	let parsed: unknown;
	try {
		parsed = JSON.parse(file === undefined ? await readStdin() : await readFile(file, 'utf8'));
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new InputError(`cannot read nodes from ${source}: ${message}`);
	}
	const nodes = Array.isArray(parsed)
		? parsed
		: (parsed as { nodes?: unknown } | null | undefined)?.nodes;
	if (!Array.isArray(nodes)) {
		throw new InputError(`${source} holds neither a node list nor { nodes: [...] }`);
	}
	return nodes as NodeInput[];
}

function parseAgent(values: { tool?: string; model?: string; effort?: string }) {
	const agent: AgentInfo = {};
	if (values.tool !== undefined) agent.tool = values.tool;
	if (values.model !== undefined) agent.model = values.model;
	if (values.effort !== undefined) agent.effort = values.effort;
	return Object.keys(agent).length ? agent : undefined;
}

function formatDoctor(report: DoctorReport): string {
	const probes = report.probes.map(
		(p) => `  ${p.server} ${p.ok ? `ok${p.version ? ` (v${p.version})` : ''}` : 'unreachable'}`
	);
	return [
		`config dir: ${report.configDir}`,
		`pinned: ${report.pinned ?? 'none'}`,
		'probes:',
		...(probes.length ? probes : ['  none']),
		`server: ${report.server ?? 'none'}`,
		`repo: ${report.repoKey}`,
		`registered: ${report.registered ? `${report.registered.name} (${report.registered.projectId})` : 'no'}`,
		`registry: ${report.registryError ?? 'ok'}`
	].join('\n');
}

export async function run(argv: string[], io: RunIo): Promise<number> {
	const client = io.client ?? createClient();
	const readStdin = io.readStdin ?? readProcessStdin;
	const [command, ...rest] = argv;

	const finish = <T>(result: Result<T>, print: (value: T) => string): number => {
		if (!result.ok) {
			io.stderr(`speculum: ${result.warning}`);
			return 0;
		}
		const text = print(result.value);
		if (text) io.stdout(text);
		return 0;
	};

	try {
		switch (command) {
			case 'open': {
				const { values, positionals } = parse(
					rest,
					{
						destination: { type: 'string' },
						summary: { type: 'string' },
						project: { type: 'string' },
						repo: { type: 'string' },
						branch: { type: 'string' },
						tool: { type: 'string' },
						model: { type: 'string' },
						effort: { type: 'string' },
						file: { type: 'string' },
						cwd: { type: 'string' },
						topic: { type: 'string' }
					},
					[0, 1]
				);
				if (values.topic !== undefined && positionals.length > 0) {
					throw new UsageError('give a title or --topic, not both');
				}
				if (values.topic === undefined && positionals.length === 0) {
					throw new UsageError('missing title');
				}
				const nodes =
					values.file === undefined ? undefined : await readNodes(values.file, readStdin);
				const result = await client.openTopic({
					title: positionals[0],
					topicId: values.topic,
					destination: values.destination,
					summary: values.summary,
					project: values.project,
					repo: values.repo,
					branch: values.branch,
					agent: parseAgent(values),
					nodes,
					cwd: values.cwd
				});
				return finish(result, (v) => `${v.topicId} ${v.url} ${v.noteUrl}`);
			}
			case 'get': {
				const { values, positionals } = parse(
					rest,
					{ path: { type: 'string' }, full: { type: 'boolean' }, json: { type: 'boolean' } },
					[1, 1]
				);
				const result = await client.getTopic({ topicId: positionals[0] });
				return finish(result, ({ snapshot }) =>
					values.json
						? JSON.stringify(snapshot)
						: formatOutline(snapshot, {
								path: values.path,
								detail: values.full ? 'full' : 'outline'
							})
				);
			}
			case 'put': {
				const { values, positionals } = parse(rest, { file: { type: 'string' } }, [1, 1]);
				const nodes = await readNodes(values.file, readStdin);
				const result = await client.putNodes({ topicId: positionals[0], nodes });
				return finish(result, (v) => `${v.nodes.length} nodes written`);
			}
			case 'rm': {
				const { positionals } = parse(rest, {}, [2, Infinity]);
				const [topicId, ...paths] = positionals;
				const result = await client.removeNodes({ topicId, paths });
				return finish(result, (v) => v.removed.join('\n'));
			}
			case 'mv': {
				const { positionals } = parse(rest, {}, [3, 3]);
				const [topicId, from, to] = positionals;
				const result = await client.moveNode({ topicId, from, to });
				return finish(result, (v) => v.moved.map((m) => `${m.from} -> ${m.to}`).join('\n'));
			}
			case 'topic': {
				const { values, positionals } = parse(
					rest,
					{
						title: { type: 'string' },
						destination: { type: 'string' },
						summary: { type: 'string' },
						status: { type: 'string' },
						current: { type: 'string' },
						'no-current': { type: 'boolean' }
					},
					[1, 1]
				);
				const status = values.status;
				if (status !== undefined && status !== 'open' && status !== 'closed') {
					throw new UsageError(`bad --status: ${status} (open or closed)`);
				}
				if (values.current !== undefined && values['no-current']) {
					throw new UsageError('give --current or --no-current, not both');
				}
				const result = await client.updateTopic({
					topicId: positionals[0],
					title: values.title,
					destination: values.destination,
					summary: values.summary,
					status,
					current: values['no-current'] ? null : values.current
				});
				return finish(result, (v) => `${v.topic.id} ${v.topic.status}`);
			}
			case 'pull': {
				const { positionals } = parse(rest, {}, [1, 1]);
				const result = await client.pullNotes({ topicId: positionals[0] });
				return finish(result, (v) => formatPulled(v, { id: positionals[0] }));
			}
			case 'resolve': {
				const { values, positionals } = parse(
					rest,
					{ reply: { type: 'string' }, changed: { type: 'string', multiple: true } },
					[2, 2]
				);
				const [topicId, id] = positionals;
				const result = await client.resolveNotes({
					topicId,
					notes: [{ id, reply: values.reply, changed: values.changed }]
				});
				return finish(result, (v) => v.notes.map((n) => `resolved ${n.id}`).join('\n'));
			}
			case 'note': {
				const { values, positionals } = parse(
					rest,
					{
						path: { type: 'string' },
						widget: { type: 'string' },
						element: { type: 'string' },
						author: { type: 'string' }
					},
					[2, 3]
				);
				const [topicId, intent, text] = positionals;
				if (!(NOTE_INTENTS as readonly string[]).includes(intent)) {
					throw new UsageError(`bad intent: ${intent} (${NOTE_INTENTS.join(', ')})`);
				}
				if (values.widget !== undefined && values.path === undefined) {
					throw new UsageError('--widget needs --path');
				}
				if (values.element !== undefined && values.widget === undefined) {
					throw new UsageError('--element needs --widget');
				}
				const anchor: Anchor = { path: values.path ?? null };
				if (values.widget !== undefined) anchor.widget = values.widget;
				if (values.element !== undefined) anchor.element = values.element;
				const result = await client.addNote({
					topicId,
					anchor,
					intent: intent as NoteIntent,
					text,
					author: values.author
				});
				return finish(result, (v) => `${v.note.id} ${v.note.status}`);
			}
			case 'send': {
				const { positionals } = parse(rest, {}, [1, 1]);
				const result = await client.send({ topicId: positionals[0] });
				return finish(result, (v) => `sent ${v.sent}`);
			}
			case 'url': {
				const { values, positionals } = parse(rest, { private: { type: 'boolean' } }, [1, 1]);
				const result = await client.topicUrl({
					topicId: positionals[0],
					private: values.private
				});
				return finish(result, (v) => v.url);
			}
			case 'doctor': {
				const { values } = parse(rest, { cwd: { type: 'string' } }, [0, 0]);
				io.stdout(formatDoctor(await client.doctor({ cwd: values.cwd })));
				return 0;
			}
			case '--help':
			case '-h':
			case 'help':
				io.stdout(USAGE);
				return 0;
			default:
				throw new UsageError(
					command === undefined ? 'missing command' : `unknown command: ${command}`
				);
		}
	} catch (error) {
		if (error instanceof UsageError) {
			io.stderr(`speculum: ${error.message}\n${USAGE}`);
			return 2;
		}
		if (error instanceof InputError) {
			io.stderr(`speculum: ${error.message}`);
			return 2;
		}
		io.stderr(`speculum: ${error instanceof Error ? error.message : String(error)}`);
		return 0;
	}
}
