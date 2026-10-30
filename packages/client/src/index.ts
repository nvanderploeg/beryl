import { homedir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { DEFAULT_CANDIDATES, createDiscovery } from './discovery.ts';
import { createStore, own, type ProjectEntry } from './files.ts';
import { UNREACHABLE_WARNING, compact, request, type Failure, type RequestInit } from './http.ts';
import { formatOutline, formatPulled } from './format.ts';
import { gitRefs, repoFromRemote, repoIdentity } from './repo.ts';
import type {
	ClientOptions,
	DoctorReport,
	OpenedTopic,
	BerylClient,
	Result
} from './client-types.ts';
import type { AgentInfo, Node, Note, Project, Pulled, Snapshot, Topic } from './types.ts';

export * from './types.ts';
export type * from './client-types.ts';
export {
	DEFAULT_CANDIDATES,
	UNREACHABLE_WARNING,
	formatOutline,
	formatPulled,
	gitRefs,
	repoFromRemote,
	repoIdentity
};

const TITLE_REQUIRED_WARNING = 'a title is required to open a new topic';

const unknownTopic = (topicId: string): Failure => ({
	ok: false,
	warning: `unknown topic ${topicId} on this machine`
});

const unreachable: Failure = { ok: false, warning: UNREACHABLE_WARNING };

// Longer waits are reported, not slept through: the board must never stall the agent.
const MAX_RATE_LIMIT_WAIT_MS = 5000;

const WAIT_TIMEOUT_MS = 43_200_000;
const WAIT_POLL_MS = 25_000;
const BACKOFF_START_MS = 1000;
const BACKOFF_MAX_MS = 30_000;

interface Target {
	server: string;
	projectId: string;
	projectUrl: string;
	writeKey?: string;
}

export function defaultConfigDir(env: Record<string, string | undefined> = process.env): string {
	return join(env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'beryl');
}

// Build links from the server's replies, never from `server`: the address we reach it on may not be its public origin.
function projectUrlFrom(topicUrl: string, topicId: string, fallback: string): string {
	const suffix = `/t/${topicId}`;
	return topicUrl.endsWith(suffix) ? topicUrl.slice(0, -suffix.length) : fallback;
}

const topicPath = (topicId: string) => `/api/topics/${encodeURIComponent(topicId)}`;

function withTool(
	agent: AgentInfo | undefined,
	env: Record<string, string | undefined>
): AgentInfo | undefined {
	if (agent?.tool || env.CLAUDECODE !== '1') return agent;
	return { ...agent, tool: 'claude-code' };
}

async function guard<T>(run: () => Promise<Result<T>>): Promise<Result<T>> {
	try {
		const result = await run();
		return result.ok ? result : { ok: false, warning: result.warning };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return { ok: false, warning: `beryl failed: ${message}` };
	}
}

export function createClient(options: ClientOptions = {}): BerylClient {
	const env = options.env ?? process.env;
	const fetchFn = options.fetch ?? globalThis.fetch;
	const requestTimeoutMs = options.requestTimeoutMs ?? 5000;
	const sleep =
		options.sleep ?? ((ms: number, signal?: AbortSignal) => delay(ms, undefined, { signal }));
	const configDir = options.configDir ?? defaultConfigDir(env);
	const store = createStore(configDir);
	const discovery = createDiscovery({
		fetch: fetchFn,
		env,
		candidates: options.candidates ?? DEFAULT_CANDIDATES,
		probeTimeoutMs: options.probeTimeoutMs ?? 300,
		remoteProbeTimeoutMs: options.remoteProbeTimeoutMs ?? 2000
	});

	async function call<T>(
		server: string,
		path: string,
		init: RequestInit,
		timeoutMs = requestTimeoutMs
	) {
		const reply = await request<T>(fetchFn, timeoutMs, `${server}${path}`, init);
		if (
			reply.ok ||
			reply.status !== 429 ||
			reply.retryAfterMs === undefined ||
			reply.retryAfterMs > MAX_RATE_LIMIT_WAIT_MS
		) {
			return reply;
		}
		await sleep(reply.retryAfterMs, init.signal).catch(() => {});
		return request<T>(fetchFn, timeoutMs, `${server}${path}`, init);
	}

	async function createProject(
		server: string,
		name: string
	): Promise<{ ok: true; entry: ProjectEntry } | Failure> {
		const reply = await call<{
			id: string;
			name?: string;
			writeKey: string;
			url?: string;
		}>(server, '/api/projects', { method: 'POST', body: { name } });
		if (!reply.ok) return reply;
		const { id, writeKey, url } = reply.body;
		return {
			ok: true,
			entry: {
				projectId: id,
				writeKey,
				name: reply.body.name ?? name,
				projectUrl: url || `${server}/p/${id}`
			}
		};
	}

	async function renameProject(
		server: string,
		repoKey: string,
		entry: ProjectEntry,
		name: string
	): Promise<ProjectEntry> {
		const reply = await call<{ project: Project }>(
			server,
			`/api/projects/${encodeURIComponent(entry.projectId)}`,
			{ method: 'PATCH', key: entry.writeKey, body: { name } }
		);
		if (!reply.ok) return entry;
		const renamed = { ...entry, name: reply.body.project.name };
		await store.saveProject(server, repoKey, renamed).catch(() => {});
		return renamed;
	}

	// Each link carries its own single-use code.
	async function privateLink(
		server: string,
		projectId: string,
		writeKey: string,
		url: string
	): Promise<Result<string>> {
		const reply = await call<{ code: string }>(
			server,
			`/api/projects/${encodeURIComponent(projectId)}/pairings`,
			{ method: 'POST', key: writeKey }
		);
		return reply.ok ? { ok: true, value: `${url}#pc=${reply.body.code}` } : reply;
	}

	// The topic exists either way: a failed mint hands back the read-only link with the reason.
	async function links(
		server: string,
		projectId: string,
		writeKey: string,
		url: string
	): Promise<Pick<OpenedTopic, 'noteUrl' | 'warning'>> {
		const link = await privateLink(server, projectId, writeKey, url);
		return link.ok
			? { noteUrl: link.value }
			: { noteUrl: url, warning: `no private link: ${link.warning}; noteUrl is read-only` };
	}

	async function targetFor(topicId: string): Promise<Result<Target>> {
		const handle = own(await store.readTopics(), topicId);
		if (!handle) return unknownTopic(topicId);
		const forServer = own(await store.readProjects(), handle.server) ?? {};
		const entry = Object.values(forServer).find((e) => e?.projectId === handle.projectId);
		return {
			ok: true,
			value: {
				server: handle.server,
				projectId: handle.projectId,
				projectUrl:
					handle.projectUrl ?? entry?.projectUrl ?? `${handle.server}/p/${handle.projectId}`,
				writeKey: entry?.writeKey
			}
		};
	}

	async function keyedTarget(
		topicId: string,
		which: 'writeKey'
	): Promise<Result<Target & { key: string }>> {
		const target = await targetFor(topicId);
		if (!target.ok) return target;
		const key = target.value[which];
		if (!key) return unknownTopic(topicId);
		return { ok: true, value: { ...target.value, key } };
	}

	async function resume(topicId: string): Promise<Result<OpenedTopic>> {
		const target = await targetFor(topicId);
		if (!target.ok) return target;
		const { server, projectId, projectUrl, writeKey } = target.value;
		if (!writeKey) return unknownTopic(topicId);
		const reply = await call<Snapshot>(server, topicPath(topicId), { method: 'GET' });
		if (!reply.ok) return reply;
		const url = `${projectUrl}/t/${topicId}`;
		return {
			ok: true,
			value: {
				topicId,
				url,
				...(await links(server, projectId, writeKey, url)),
				projectUrl,
				server,
				projectId,
				createdProject: false,
				resumed: true
			}
		};
	}

	const api: BerylClient = {
		discover: () => discovery.discover().catch(() => null),

		openTopic: (input) =>
			guard(async () => {
				if (input.topicId !== undefined) return resume(input.topicId);
				if (!input.title) return { ok: false, warning: TITLE_REQUIRED_WARNING };
				const server = await discovery.discover();
				if (!server) return unreachable;
				const cwd = input.cwd ?? process.cwd();
				const identity = await repoIdentity(cwd);
				await store.assertReadable();

				const name = input.project ?? identity.name;
				const resolved = await store.resolveProject(server, identity.repoKey, () =>
					createProject(server, name)
				);
				if (!resolved.ok) return resolved;
				let entry = resolved.entry;
				let createdProject = resolved.created;
				if (!createdProject && input.project && input.project !== entry.name) {
					entry = await renameProject(server, identity.repoKey, entry, input.project);
				}

				const refs =
					input.repo === undefined || input.branch === undefined ? await gitRefs(cwd) : {};
				const body = compact({
					title: input.title,
					destination: input.destination,
					summary: input.summary,
					agent: withTool(input.agent, env),
					repo: input.repo ?? refs.repo,
					branch: input.branch ?? refs.branch,
					nodes: input.nodes
				});
				const post = (e: ProjectEntry) =>
					call<{ topicId: string; url: string; topic: Topic; nodes: Node[] }>(
						server,
						`/api/projects/${encodeURIComponent(e.projectId)}/topics`,
						{ method: 'POST', key: e.writeKey, body }
					);

				let reply = await post(entry);
				if (!reply.ok && !createdProject && [401, 403, 404].includes(reply.status ?? 0)) {
					const replaced = await store.resolveProject(
						server,
						identity.repoKey,
						() => createProject(server, name),
						entry
					);
					if (!replaced.ok) return replaced;
					entry = replaced.entry;
					createdProject = replaced.created;
					reply = await post(entry);
				}
				if (!reply.ok) return reply;

				const { topicId, url } = reply.body;
				const projectUrl = projectUrlFrom(url, topicId, entry.projectUrl);
				await store
					.saveTopic(topicId, { server, projectId: entry.projectId, projectUrl })
					.catch(() => {});
				return {
					ok: true,
					value: {
						topicId,
						url,
						...(await links(server, entry.projectId, entry.writeKey, url)),
						projectUrl,
						server,
						projectId: entry.projectId,
						createdProject,
						resumed: false
					}
				};
			}),

		getTopic: (input) =>
			guard(async () => {
				const target = await targetFor(input.topicId);
				if (!target.ok) return target;
				const { server, projectUrl } = target.value;
				const reply = await call<Snapshot>(server, topicPath(input.topicId), { method: 'GET' });
				if (!reply.ok) return reply;
				return {
					ok: true,
					value: { snapshot: reply.body, url: `${projectUrl}/t/${input.topicId}` }
				};
			}),

		putNodes: (input) =>
			guard(async () => {
				const target = await keyedTarget(input.topicId, 'writeKey');
				if (!target.ok) return target;
				const { server, key } = target.value;
				const reply = await call<{ nodes: Node[] }>(server, `${topicPath(input.topicId)}/nodes`, {
					method: 'PUT',
					key,
					body: { nodes: input.nodes }
				});
				return reply.ok ? { ok: true, value: { nodes: reply.body.nodes } } : reply;
			}),

		removeNodes: (input) =>
			guard(async () => {
				const target = await keyedTarget(input.topicId, 'writeKey');
				if (!target.ok) return target;
				const { server, key } = target.value;
				const reply = await call<{ removed: string[] }>(
					server,
					`${topicPath(input.topicId)}/nodes`,
					{ method: 'DELETE', key, body: { paths: input.paths } }
				);
				return reply.ok ? { ok: true, value: { removed: reply.body.removed } } : reply;
			}),

		moveNode: (input) =>
			guard(async () => {
				const target = await keyedTarget(input.topicId, 'writeKey');
				if (!target.ok) return target;
				const { server, key } = target.value;
				const reply = await call<{ moved: { from: string; to: string }[] }>(
					server,
					`${topicPath(input.topicId)}/move`,
					{ method: 'POST', key, body: { from: input.from, to: input.to } }
				);
				return reply.ok ? { ok: true, value: { moved: reply.body.moved } } : reply;
			}),

		updateTopic: (input) =>
			guard(async () => {
				const target = await keyedTarget(input.topicId, 'writeKey');
				if (!target.ok) return target;
				const { server, key } = target.value;
				const reply = await call<{ topic: Topic }>(server, topicPath(input.topicId), {
					method: 'PATCH',
					key,
					body: compact({
						title: input.title,
						destination: input.destination,
						summary: input.summary,
						status: input.status,
						current: input.current,
						agent: input.agent
					})
				});
				return reply.ok ? { ok: true, value: { topic: reply.body.topic } } : reply;
			}),

		pullNotes: (input) =>
			guard(async () => {
				const target = await keyedTarget(input.topicId, 'writeKey');
				if (!target.ok) return target;
				const { server, key } = target.value;
				const reply = await call<Pulled>(server, `${topicPath(input.topicId)}/pull`, {
					method: 'POST',
					key
				});
				return reply.ok ? { ok: true, value: reply.body } : reply;
			}),

		resolveNotes: (input) =>
			guard(async () => {
				const target = await keyedTarget(input.topicId, 'writeKey');
				if (!target.ok) return target;
				const { server, key } = target.value;
				const reply = await call<{ notes: Note[] }>(server, `${topicPath(input.topicId)}/resolve`, {
					method: 'POST',
					key,
					body: { notes: input.notes }
				});
				return reply.ok ? { ok: true, value: { notes: reply.body.notes } } : reply;
			}),

		waitForSent: (input) =>
			guard(async () => {
				const target = await keyedTarget(input.topicId, 'writeKey');
				if (!target.ok) return target;
				const { server, key } = target.value;
				const { signal } = input;
				const timeoutMs = input.timeoutMs ?? WAIT_TIMEOUT_MS;
				const pollMs = input.pollMs ?? WAIT_POLL_MS;
				const deadline = timeoutMs > 0 ? Date.now() + timeoutMs : Infinity;
				let backoff = BACKOFF_START_MS;
				while (!signal?.aborted) {
					const left = deadline - Date.now();
					if (left <= 0) break;
					const poll = Math.max(1, Math.min(pollMs, left));
					const reply = await call<{ sent?: unknown }>(
						server,
						`${topicPath(input.topicId)}/wait?timeoutMs=${poll}`,
						{ method: 'GET', key, signal },
						poll + requestTimeoutMs
					);
					if (signal?.aborted) break;
					if (reply.ok) {
						backoff = BACKOFF_START_MS;
						const sent = reply.body.sent;
						if (typeof sent === 'number' && sent > 0) return { ok: true, value: { sent } };
						continue;
					}
					if (reply.status !== undefined && reply.status >= 400 && reply.status < 500) {
						return reply;
					}
					await sleep(Math.min(backoff, left), signal).catch(() => {});
					backoff = Math.min(backoff * 2, BACKOFF_MAX_MS);
				}
				return { ok: true, value: { sent: 0 } };
			}),

		addNote: (input) =>
			guard(async () => {
				const target = await keyedTarget(input.topicId, 'writeKey');
				if (!target.ok) return target;
				const { server, key } = target.value;
				const reply = await call<{ note: Note }>(server, `${topicPath(input.topicId)}/notes`, {
					method: 'POST',
					key,
					body: compact({
						anchor: input.anchor,
						intent: input.intent,
						text: input.text,
						author: input.author
					})
				});
				return reply.ok ? { ok: true, value: { note: reply.body.note } } : reply;
			}),

		send: (input) =>
			guard(async () => {
				const target = await keyedTarget(input.topicId, 'writeKey');
				if (!target.ok) return target;
				const { server, key } = target.value;
				const reply = await call<{ sent: number }>(server, `${topicPath(input.topicId)}/send`, {
					method: 'POST',
					key
				});
				return reply.ok ? { ok: true, value: { sent: reply.body.sent } } : reply;
			}),

		topicUrl: (input) =>
			guard(async () => {
				const target = await targetFor(input.topicId);
				if (!target.ok) return target;
				const url = `${target.value.projectUrl}/t/${input.topicId}`;
				if (!input.private) return { ok: true, value: { url } };
				const { server, projectId, writeKey } = target.value;
				if (!writeKey) return unknownTopic(input.topicId);
				const link = await privateLink(server, projectId, writeKey, url);
				return link.ok ? { ok: true, value: { url: link.value } } : link;
			}),

		async doctor(input = {}): Promise<DoctorReport> {
			const { repoKey } = await repoIdentity(input.cwd ?? process.cwd());
			const probes = await discovery.probeAll();
			const server = probes.find((p) => p.ok)?.server ?? null;
			let registryError: string | null = null;
			let entry: ProjectEntry | undefined;
			try {
				await store.assertReadable();
				entry = server ? own(own(await store.readProjects(), server), repoKey) : undefined;
			} catch (error) {
				registryError = error instanceof Error ? error.message : String(error);
			}
			return {
				configDir,
				pinned: discovery.pinned,
				probes,
				server,
				repoKey,
				registered: entry ? { projectId: entry.projectId, name: entry.name } : null,
				registryError
			};
		}
	};

	return api;
}
