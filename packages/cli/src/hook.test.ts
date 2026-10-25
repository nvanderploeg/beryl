import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { SpeculumClient, Pulled } from '@speculum/client';
import { handleHook, type HookInput } from './hook.ts';

const TOPIC = '0b5f8a52-8c55-4c1e-9d7e-3f2a1c9b8e77';
const OTHER = '7c1d0f00-0000-4000-8000-000000000000';
const URL = `http://localhost:3270/p/proj/t/${TOPIC}`;
const OPENED = {
	topicId: TOPIC,
	url: URL,
	noteUrl: `${URL}#nk=sn_x`,
	projectUrl: 'http://localhost:3270/p/proj',
	server: 'http://localhost:3270',
	projectId: 'proj',
	createdProject: false,
	resumed: false
};
const OPEN_RESPONSE = [{ type: 'text', text: JSON.stringify(OPENED) }];

const QUIET: Pulled = { notes: [], unresolved: [], context: {}, stale: [] };
const NOTE = {
	id: 'n1',
	topicId: TOPIC,
	anchor: { path: null },
	intent: 'comment' as const,
	text: 'Looks right.',
	author: '',
	status: 'delivered' as const,
	sentAt: null,
	deliveredAt: null,
	resolvedAt: null,
	reply: '',
	changed: [],
	createdAt: '',
	updatedAt: ''
};

const NO_LISTENER = `speculum: no board listener is running. Before you end this turn, run \`speculum wait ${TOPIC}\` in the background so Send on the board reaches you.`;
const UNREACHABLE = `speculum: could not reach the board for topic ${TOPIC}; call pull_notes before you answer.`;

const dirs: string[] = [];
afterEach(() => {
	for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function session(id = 'sess-1', opts: { listening?: boolean; timeoutMs?: number } = {}) {
	const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'speculum-hook-')), 'sessions');
	dirs.push(path.dirname(dir));
	const client = { pullNotes: vi.fn(async () => ({ ok: true, value: QUIET })) };
	const isListening = vi.fn(() => opts.listening ?? true);
	const deps = {
		dir,
		client: client as unknown as SpeculumClient,
		isListening,
		timeoutMs: opts.timeoutMs
	};
	const raw = (text: string) => handleHook(text, deps);
	const send = async (input: HookInput) => {
		const out = await raw(JSON.stringify({ session_id: id, ...input }));
		return out ? JSON.parse(out) : null;
	};
	const context = async (input: HookInput): Promise<string | undefined> =>
		(await send(input))?.hookSpecificOutput?.additionalContext;
	const state = () => JSON.parse(fs.readFileSync(path.join(dir, `${id}.json`), 'utf8'));
	return { dir, client, isListening, raw, send, context, state };
}

const post = (tool_name: string, extra: Partial<HookInput> = {}): HookInput => ({
	hook_event_name: 'PostToolUse',
	tool_name,
	tool_input: {},
	...extra
});

const openTopic = post('mcp__speculum__open_topic', {
	tool_input: { title: 'Retries' },
	tool_response: OPEN_RESPONSE
});
const prompt: HookInput = { hook_event_name: 'UserPromptSubmit' };
const closeTopic = (topicId = TOPIC, status = 'closed') =>
	post('mcp__speculum__update_topic', {
		tool_input: { topicId, status },
		tool_response: [{ type: 'text', text: '{"topic":{}}' }]
	});

describe('sessions with no Topic', () => {
	it('stay silent on every event and write no state', async () => {
		const s = session();

		expect(await s.send(prompt)).toBeNull();
		expect(await s.send(post('Bash'))).toBeNull();
		expect(await s.send({ hook_event_name: 'SessionStart', source: 'compact' })).toBeNull();
		expect(s.client.pullNotes).not.toHaveBeenCalled();
		expect(fs.existsSync(s.dir)).toBe(false);
	});
});

describe('recording the Topic', () => {
	it('records the topicId and url from an open_topic response', async () => {
		const s = session();

		expect(await s.send(openTopic)).toBeNull();

		expect(s.state()).toEqual({ topicId: TOPIC, url: URL, closed: false });
		expect(fs.statSync(path.join(s.dir, 'sess-1.json')).mode & 0o777).toBe(0o600);
	});

	it('reads a response serialised as a JSON string', async () => {
		const s = session();

		await s.send(
			post('mcp__speculum__open_topic', { tool_response: JSON.stringify(OPEN_RESPONSE) })
		);

		expect(s.state()).toEqual({ topicId: TOPIC, url: URL, closed: false });
	});

	it('records the Topic of a get_topic from its input', async () => {
		const s = session();

		await s.send(
			post('mcp__speculum__get_topic', {
				tool_input: { topicId: TOPIC },
				tool_response: [{ type: 'text', text: 'Topic "Retries" (open)\nNotes: 0 queued' }]
			})
		);

		expect(s.state()).toEqual({ topicId: TOPIC, closed: false });
	});

	it('keeps the url when get_topic names the Topic already recorded', async () => {
		const s = session();
		await s.send(openTopic);

		await s.send(post('mcp__speculum__get_topic', { tool_input: { topicId: TOPIC } }));

		expect(s.state()).toEqual({ topicId: TOPIC, url: URL, closed: false });
	});

	it('records a resumed Topic from the open_topic input when the response names none', async () => {
		const s = session();

		await s.send(
			post('mcp__speculum__open_topic', {
				tool_input: { topicId: OTHER },
				tool_response: [{ type: 'text', text: '{}' }]
			})
		);

		expect(s.state()).toEqual({ topicId: OTHER, closed: false });
	});

	it('records nothing from an open_topic that failed', async () => {
		const s = session();

		await s.send(
			post('mcp__speculum__open_topic', {
				tool_input: { topicId: TOPIC },
				tool_response: [
					{ type: 'text', text: 'speculum: speculum unreachable — continuing without the board' }
				]
			})
		);

		expect(await s.send(prompt)).toBeNull();
		expect(fs.existsSync(s.dir)).toBe(false);
	});

	it('reopens a closed Topic when open_topic names it again', async () => {
		const s = session();
		await s.send(openTopic);
		await s.send(closeTopic());

		await s.send(openTopic);

		expect(s.state().closed).toBe(false);
	});
});

describe('closing the Topic', () => {
	it('stops pulling once update_topic closes it, and starts again when it reopens', async () => {
		const s = session();
		await s.send(openTopic);

		await s.send(closeTopic());
		expect(s.state().closed).toBe(true);
		expect(await s.send(prompt)).toBeNull();
		expect(s.client.pullNotes).not.toHaveBeenCalled();

		await s.send(closeTopic(TOPIC, 'open'));
		expect(await s.context(prompt)).toBeDefined();
	});

	it('ignores update_topic on another Topic, without a status or that failed', async () => {
		const s = session();
		await s.send(openTopic);

		await s.send(closeTopic(OTHER));
		await s.send(
			post('mcp__speculum__update_topic', { tool_input: { topicId: TOPIC, title: 't' } })
		);
		await s.send(
			post('mcp__speculum__update_topic', {
				tool_input: { topicId: TOPIC, status: 'closed' },
				tool_response: [{ type: 'text', text: 'speculum: speculum rejected the write: nope' }]
			})
		);

		expect(s.state().closed).toBe(false);
	});
});

describe('UserPromptSubmit on an open Topic', () => {
	it('pulls and returns formatPulled as additionalContext', async () => {
		const s = session();
		s.client.pullNotes.mockResolvedValue({ ok: true, value: { ...QUIET, notes: [NOTE] } });
		await s.send(openTopic);

		const out = await s.send(prompt);

		expect(s.client.pullNotes).toHaveBeenCalledExactlyOnceWith({ topicId: TOPIC });
		expect(out).toEqual({
			hookSpecificOutput: {
				hookEventName: 'UserPromptSubmit',
				additionalContext: [
					`speculum: 1 new note from the board on topic ${TOPIC}:`,
					'- [comment] topic: Looks right. (note n1)',
					'Fold each note into the model, then call resolve_notes with a one-line reply for each.'
				].join('\n')
			}
		});
	});

	it('adds the listener line when no listener is running', async () => {
		const s = session('sess-1', { listening: false });
		await s.send(openTopic);

		expect(await s.context(prompt)).toBe(
			`speculum: no new notes on the board for topic ${TOPIC}.\n${NO_LISTENER}`
		);
		expect(s.isListening).toHaveBeenCalledWith(TOPIC);
	});

	it('leaves the listener line out while a listener runs', async () => {
		const s = session('sess-1', { listening: true });
		await s.send(openTopic);

		expect(await s.context(prompt)).toBe(`speculum: no new notes on the board for topic ${TOPIC}.`);
	});

	it('says the board could not be reached when the pull fails', async () => {
		const s = session('sess-1', { listening: false });
		s.client.pullNotes.mockResolvedValue({ ok: false, warning: 'x' } as never);
		await s.send(openTopic);

		expect(await s.context(prompt)).toBe(UNREACHABLE);
	});

	it('gives up on a pull that outlasts timeoutMs', async () => {
		const s = session('sess-1', { timeoutMs: 20 });
		s.client.pullNotes.mockImplementation(() => new Promise(() => {}) as never);
		await s.send(openTopic);

		const started = Date.now();
		expect(await s.context(prompt)).toBe(UNREACHABLE);
		expect(Date.now() - started).toBeLessThan(500);
	});

	it('stays silent when the pull throws', async () => {
		const s = session();
		s.client.pullNotes.mockRejectedValue(new Error('boom'));
		await s.send(openTopic);

		expect(await s.send(prompt)).toBeNull();
	});
});

describe('SessionStart', () => {
	it.each(['compact', 'resume'])('names the open Topic after %s', async (source) => {
		const s = session();
		await s.send(openTopic);

		expect(await s.send({ hook_event_name: 'SessionStart', source })).toEqual({
			hookSpecificOutput: {
				hookEventName: 'SessionStart',
				additionalContext: `speculum: this session grills topic ${TOPIC} (${URL}). Call get_topic before writing to it again.`
			}
		});
	});

	it('stays silent on a fresh start and for a closed Topic', async () => {
		const s = session();
		await s.send(openTopic);

		expect(await s.send({ hook_event_name: 'SessionStart', source: 'startup' })).toBeNull();
		await s.send(closeTopic());
		expect(await s.send({ hook_event_name: 'SessionStart', source: 'compact' })).toBeNull();
	});

	it('prunes session files untouched for two weeks', async () => {
		const s = session('fresh');
		await s.send(openTopic);
		const old = path.join(s.dir, 'old.json');
		fs.writeFileSync(old, '{}');
		const weeksAgo = (Date.now() - 15 * 24 * 60 * 60 * 1000) / 1000;
		fs.utimesSync(old, weeksAgo, weeksAgo);

		await s.send({ hook_event_name: 'SessionStart', source: 'startup' });

		expect(fs.readdirSync(s.dir)).toEqual(['fresh.json']);
	});
});

describe('unexpected input', () => {
	it.each([
		['unparseable input', 'not json'],
		['a JSON value that is not an object', '42'],
		['null', 'null'],
		['a missing session_id', JSON.stringify({ hook_event_name: 'UserPromptSubmit' })],
		['a session_id that is not a string', JSON.stringify({ session_id: 7 })],
		['an unknown event', JSON.stringify({ session_id: 's', hook_event_name: 'Stop' })]
	])('returns nothing for %s', async (_label, raw) => {
		const s = session();

		expect(await s.raw(raw)).toBe('');
	});

	it('keeps a session file inside the sessions dir whatever the session_id', async () => {
		const s = session('../../escape');
		await s.send(openTopic);

		expect(fs.readdirSync(s.dir)).toEqual(['escape.json']);
	});

	it('treats a damaged session file as a fresh session', async () => {
		const s = session();
		fs.mkdirSync(s.dir, { recursive: true });
		fs.writeFileSync(path.join(s.dir, 'sess-1.json'), '{oops');

		expect(await s.send(prompt)).toBeNull();
		await s.send(openTopic);
		expect(s.state()).toEqual({ topicId: TOPIC, url: URL, closed: false });
	});
});
