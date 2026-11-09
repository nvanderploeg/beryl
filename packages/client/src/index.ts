import { homedir, hostname } from 'node:os';
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
	LoginState,
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

// Stands in for a Write key on owned projects: calls swap it for a fresh Firebase ID token.
export const LOGIN_KEY = 'login';
const ID_TOKEN_SLACK_MS = 60_000;
const LOGIN_POLLS = 6;
const LOGIN_INTERVAL_MS = 3000;
const WAIT_TIMEOUT_MS = 43_200_000;
const WAIT_POLL_MS = 25_000;
const BACKOFF_START_MS = 1000;
const BACKOFF_MAX_MS = 30_000;

interface Target {
	server: string;
	projectId: string;
	projectUrl: string;
	topicSlug?: string;
	writeKey?: string;
}

// The Firebase ID token's own claims: who signed in and for which project.
function claimsOf(idToken: string | undefined) {
	try {
		const payload = JSON.parse(Buffer.from(idToken!.split('.')[1], 'base64url').toString('utf8'));
		const { sub: uid, aud: projectId, email } = payload;
		if (typeof uid !== 'string' || typeof projectId !== 'string') return null;
		return { uid, projectId, email: typeof email === 'string' ? email : undefined };
	} catch {
		return null;
	}
}

export function defaultConfigDir(env: Record<string, string | undefined> = process.env): string {
	return join(env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'beryl');
}

export function defaultLoginFile(env: Record<string, string | undefined> = process.env): string {
	return join(env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'runestone', 'login.json');
}

// Build links from the server's replies, never from `server`: the address we reach it on may not be its public origin.
function projectUrlFrom(topicUrl: string, topicSlug: string, fallback: string): string {
	const suffix = `/t/${topicSlug}`;
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
	const store = createStore(configDir, options.loginFile ?? defaultLoginFile(env));
	const discovery = createDiscovery({
		fetch: fetchFn,
		env,
		candidates: options.candidates ?? DEFAULT_CANDIDATES,
		probeTimeoutMs: options.probeTimeoutMs ?? 300,
		remoteProbeTimeoutMs: options.remoteProbeTimeoutMs ?? 2000
	});

	async function postJson<T>(url: string, body: unknown, form = false): Promise<T | null> {
		try {
			const res = await fetchFn(url, {
				method: 'POST',
				headers: {
					'content-type': form ? 'application/x-www-form-urlencoded' : 'application/json'
				},
				body: form ? new URLSearchParams(body as Record<string, string>) : JSON.stringify(body),
				signal: AbortSignal.timeout(requestTimeoutMs)
			});
			return res.ok ? ((await res.json()) as T) : null;
		} catch {
			return null;
		}
	}

	// Keyed by server: a live ID token is only ever sent to the server it was fetched for.
	const cachedIds = new Map<string, { refreshToken: string; idToken: string; expiresAt: number }>();

	async function webConfig(server: string) {
		const reply = await call<{ enabled: boolean; config?: { apiKey: string; projectId: string } }>(
			server,
			'/api/auth/config',
			{ method: 'GET' }
		);
		return reply.ok && reply.body.enabled ? reply.body.config : undefined;
	}

	// Forget a login the server or Firebase will never accept again, unless another process has replaced it.
	async function dropLogin(refreshToken: string): Promise<void> {
		cachedIds.clear();
		if ((await store.readLogin())?.refreshToken === refreshToken) await store.clearLogin();
	}

	// 'rejected' means Firebase refused the refresh token itself; null is any other failure.
	async function refreshIdToken(apiKey: string, refreshToken: string) {
		try {
			const res = await fetchFn(
				`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(apiKey)}`,
				{
					method: 'POST',
					headers: { 'content-type': 'application/x-www-form-urlencoded' },
					body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
					signal: AbortSignal.timeout(requestTimeoutMs)
				}
			);
			if (res.status === 400 || res.status === 401) return 'rejected' as const;
			return res.ok
				? ((await res.json()) as { id_token: string; refresh_token: string; expires_in: string })
				: null;
		} catch {
			return null;
		}
	}

	async function freshIdToken(server: string): Promise<string | undefined> {
		const login = await store.readLogin();
		if (!login) return undefined;
		const cached = cachedIds.get(server);
		if (
			cached?.refreshToken === login.refreshToken &&
			cached.expiresAt - Date.now() > ID_TOKEN_SLACK_MS
		) {
			return cached.idToken;
		}
		const config = await webConfig(server);
		if (!config) return undefined;
		if (config.projectId !== login.projectId) {
			await dropLogin(login.refreshToken);
			return undefined;
		}
		const refreshed = await refreshIdToken(config.apiKey, login.refreshToken);
		if (refreshed === 'rejected') {
			await dropLogin(login.refreshToken);
			return undefined;
		}
		const got = refreshed;
		if (!got) return undefined;
		if (got.refresh_token !== login.refreshToken) {
			const current = await store.readLogin();
			if (current?.refreshToken === login.refreshToken) {
				await store.saveLogin({ ...current, refreshToken: got.refresh_token });
			}
		}
		cachedIds.set(server, {
			refreshToken: got.refresh_token,
			idToken: got.id_token,
			expiresAt: Date.now() + Number(got.expires_in) * 1000
		});
		return got.id_token;
	}

	async function call<T>(
		server: string,
		path: string,
		rawInit: RequestInit,
		timeoutMs = requestTimeoutMs
	) {
		let init = rawInit;
		if (init.key === LOGIN_KEY) {
			const idToken = await freshIdToken(server);
			if (!idToken) {
				return {
					ok: false as const,
					warning: 'beryl login lapsed; call login to sign in again',
					status: 401
				};
			}
			init = { ...init, key: idToken };
		}
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
		const signedIn = Boolean(await store.readLogin());
		type Created = { id: string; name?: string; writeKey?: string; url?: string };
		const create = (key?: string) =>
			call<Created>(server, '/api/projects', { method: 'POST', key, body: { name } });
		let reply = await create(signedIn ? LOGIN_KEY : undefined);
		const lapsed = signedIn && !reply.ok && !(await store.readLogin());
		if (lapsed) reply = await create();
		if (!reply.ok) return reply;
		const stillSignedIn = signedIn && !lapsed;
		const { id, writeKey, url } = reply.body;
		const key = writeKey ?? (stillSignedIn ? LOGIN_KEY : undefined);
		if (!key) return { ok: false, warning: 'beryl returned no key for the new project' };
		return {
			ok: true,
			entry: {
				projectId: id,
				writeKey: key,
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
				topicSlug: handle.slug,
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
		const reply = await call<Snapshot>(server, topicPath(topicId), {
			method: 'GET',
			key: writeKey
		});
		if (!reply.ok) return reply;
		const url = `${projectUrl}/t/${reply.body.topic.slug ?? topicId}`;
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

		login: () =>
			guard<LoginState>(async () => {
				const server = await discovery.discover();
				if (!server) return unreachable;
				if (await store.readLogin()) {
					await freshIdToken(server);
					if (await store.readLogin()) return { ok: true, value: { status: 'signed_in' as const } };
				}
				let pending = await store.readPending(server);
				if (!pending || Date.parse(pending.expiresAt) <= Date.now()) {
					const started = await call<{
						deviceCode: string;
						userCode: string;
						verificationUrl: string;
						expiresAt: string;
					}>(server, '/api/auth/device', {
						method: 'POST',
						body: { label: `${env.CLAUDECODE === '1' ? 'claude-code' : 'beryl'} on ${hostname()}` }
					});
					if (!started.ok) return started;
					pending = {
						deviceCode: started.body.deviceCode,
						userCode: started.body.userCode,
						url: started.body.verificationUrl,
						expiresAt: started.body.expiresAt
					};
					await store.savePending(server, pending);
				}
				for (let attempt = 1; ; attempt++) {
					const polled = await call<{ customToken?: string; apiKey?: string }>(
						server,
						'/api/auth/device/token',
						{ method: 'POST', body: { deviceCode: pending.deviceCode } }
					);
					if (!polled.ok) {
						if (polled.status === 410) await store.savePending(server, undefined);
						return polled;
					}
					if (polled.body.customToken && polled.body.apiKey) {
						const { apiKey, customToken } = polled.body;
						const got = await postJson<{
							idToken: string;
							refreshToken: string;
							expiresIn: string;
							email?: string;
						}>(
							`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(apiKey)}`,
							{ token: customToken, returnSecureToken: true }
						);
						const claims = claimsOf(got?.idToken);
						if (!got || !claims) {
							return { ok: false, warning: 'firebase refused the sign-in; try login again' };
						}
						await store.saveLogin({
							refreshToken: got.refreshToken,
							uid: claims.uid,
							projectId: claims.projectId,
							...(claims.email ? { email: claims.email } : {})
						});
						await store.savePending(server, undefined);
						cachedIds.set(server, {
							refreshToken: got.refreshToken,
							idToken: got.idToken,
							expiresAt: Date.now() + Number(got.expiresIn) * 1000
						});
						return { ok: true, value: { status: 'signed_in' as const } };
					}
					if (attempt >= LOGIN_POLLS) break;
					await sleep(LOGIN_INTERVAL_MS);
				}
				return {
					ok: true,
					value: { status: 'pending' as const, url: pending.url, userCode: pending.userCode }
				};
			}),

		logout: () =>
			guard(async () => {
				const server = await discovery.discover();
				const signedIn = Boolean(await store.readLogin());
				const token = signedIn && server ? await freshIdToken(server) : undefined;
				const reply =
					token && server
						? await call(server, '/api/me/agents', { method: 'DELETE', key: token })
						: undefined;
				await store.clearLogin();
				cachedIds.clear();
				if (server) await store.savePending(server, undefined);
				return {
					ok: true,
					value: { status: 'signed_out' as const, revoked: !signedIn || reply?.ok === true }
				};
			}),

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

				const { topicId, url, topic } = reply.body;
				const projectUrl = projectUrlFrom(url, topic.slug ?? topicId, entry.projectUrl);
				await store
					.saveTopic(topicId, {
						server,
						projectId: entry.projectId,
						projectUrl,
						...(topic.slug && { slug: topic.slug })
					})
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
				const reply = await call<Snapshot>(server, topicPath(input.topicId), {
					method: 'GET',
					key: target.value.writeKey
				});
				if (!reply.ok) return reply;
				return {
					ok: true,
					value: {
						snapshot: reply.body,
						url: `${projectUrl}/t/${reply.body.topic.slug ?? input.topicId}`
					}
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
				const url = `${target.value.projectUrl}/t/${target.value.topicSlug ?? input.topicId}`;
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
