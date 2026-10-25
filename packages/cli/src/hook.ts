import {
	mkdirSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmSync,
	statSync,
	writeFileSync
} from 'node:fs';
import { join } from 'node:path';
import { formatPulled, type BerylClient, type Pulled, type Result } from '@beryl/client';

export interface HookInput {
	session_id?: string;
	hook_event_name?: string;
	source?: string;
	tool_name?: string;
	tool_input?: Record<string, unknown>;
	tool_response?: unknown;
}

export interface SessionState {
	topicId?: string;
	url?: string;
	closed: boolean;
}

export interface HookDeps {
	dir: string;
	client: BerylClient;
	isListening(topicId: string): boolean;
	timeoutMs?: number;
}

export const HOOK_TIMEOUT_MS = 1500;
const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;

const OPEN_TOPIC = 'mcp__beryl__open_topic';
const GET_TOPIC = 'mcp__beryl__get_topic';
const UPDATE_TOPIC = 'mcp__beryl__update_topic';

const noListener = (topicId: string) =>
	`beryl: no board listener is running. Before you end this turn, run \`beryl wait ${topicId}\` in the background so Send on the board reaches you.`;

const unreachable = (topicId: string) =>
	`beryl: could not reach the board for topic ${topicId}; call pull_notes before you answer.`;

const resumed = (s: SessionState) =>
	`beryl: this session grills topic ${s.topicId}${s.url ? ` (${s.url})` : ''}. Call get_topic before writing to it again.`;

function responseText(response: unknown): string {
	if (typeof response === 'string') return response;
	if (Array.isArray(response)) return response.map(responseText).join('\n');
	if (response && typeof response === 'object') {
		const text = (response as { text?: unknown }).text;
		if (typeof text === 'string') return text;
		const content = (response as { content?: unknown }).content;
		if (content !== undefined) return responseText(content);
	}
	return JSON.stringify(response ?? '');
}

const field = (text: string, name: string) =>
	new RegExp(`"${name}\\\\?":\\\\?"([^"\\\\]+)`).exec(text)?.[1];

const failed = (text: string) => text.trimStart().startsWith('beryl:');

function afterTool(state: SessionState, input: HookInput): SessionState {
	const tool = input.tool_name;
	const text = responseText(input.tool_response);
	if (failed(text)) return state;
	const given = input.tool_input?.topicId;
	const named = typeof given === 'string' && given ? given : undefined;
	if (tool === OPEN_TOPIC || tool === GET_TOPIC) {
		const topicId =
			tool === OPEN_TOPIC ? (field(text, 'topicId') ?? named) : (named ?? field(text, 'topicId'));
		if (!topicId) return state;
		const url =
			(tool === OPEN_TOPIC ? field(text, 'url') : undefined) ??
			(topicId === state.topicId ? state.url : undefined);
		return url ? { topicId, url, closed: false } : { topicId, closed: false };
	}
	if (tool === UPDATE_TOPIC && state.topicId && named === state.topicId) {
		const status = input.tool_input?.status;
		if (status === 'open' || status === 'closed') return { ...state, closed: status === 'closed' };
	}
	return state;
}

function context(event: string, text: string): string {
	return JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext: text } });
}

async function pullWithin(
	client: BerylClient,
	topicId: string,
	ms: number
): Promise<Result<Pulled> | null> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const late = new Promise<null>((resolve) => {
		timer = setTimeout(() => resolve(null), ms);
	});
	try {
		return await Promise.race([client.pullNotes({ topicId }), late]);
	} finally {
		clearTimeout(timer);
	}
}

export function sessionsDir(configDir: string): string {
	return join(configDir, 'sessions');
}

function load(file: string): SessionState {
	try {
		const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<SessionState>;
		return {
			...(typeof parsed.topicId === 'string' ? { topicId: parsed.topicId } : {}),
			...(typeof parsed.url === 'string' ? { url: parsed.url } : {}),
			closed: parsed.closed === true
		};
	} catch {
		return { closed: false };
	}
}

function save(dir: string, file: string, state: SessionState): void {
	mkdirSync(dir, { recursive: true, mode: 0o700 });
	const tmp = `${file}.${process.pid}.tmp`;
	writeFileSync(tmp, JSON.stringify(state), { mode: 0o600 });
	renameSync(tmp, file);
}

function prune(dir: string, now: number): void {
	let names: string[];
	try {
		names = readdirSync(dir);
	} catch {
		return;
	}
	for (const name of names) {
		const file = join(dir, name);
		try {
			if (now - statSync(file).mtimeMs > SESSION_TTL_MS) rmSync(file, { force: true });
		} catch {
			continue;
		}
	}
}

// Never throws: a broken hook must not reach the agent's work.
export async function handleHook(raw: string, deps: HookDeps): Promise<string> {
	try {
		const input = JSON.parse(raw) as HookInput;
		if (typeof input !== 'object' || input === null) return '';
		const id = typeof input.session_id === 'string' ? input.session_id.replace(/[^\w-]/g, '') : '';
		if (!id) return '';
		const file = join(deps.dir, `${id}.json`);
		const event = input.hook_event_name;
		if (event === 'SessionStart') prune(deps.dir, Date.now());
		const state = load(file);
		const open = state.topicId !== undefined && !state.closed;

		switch (event) {
			case 'PostToolUse': {
				const next = afterTool(state, input);
				if (JSON.stringify(next) !== JSON.stringify(state)) save(deps.dir, file, next);
				return '';
			}
			case 'UserPromptSubmit': {
				if (!open) return '';
				const topicId = state.topicId!;
				const pulled = await pullWithin(deps.client, topicId, deps.timeoutMs ?? HOOK_TIMEOUT_MS);
				if (!pulled?.ok) return context(event, unreachable(topicId));
				const lines = [formatPulled(pulled.value, { id: topicId })];
				if (!deps.isListening(topicId)) lines.push(noListener(topicId));
				return context(event, lines.join('\n'));
			}
			case 'SessionStart':
				if (!open || (input.source !== 'compact' && input.source !== 'resume')) return '';
				return context(event, resumed(state));
		}
		return '';
	} catch {
		return '';
	}
}
