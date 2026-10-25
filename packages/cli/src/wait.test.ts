import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { BerylClient, Pulled } from '@beryl/client';
import { isAlive, isListening, pidFile, runWait, waitCommand, type WaitDeps } from './wait.ts';

const TOPIC = '0b5f8a52-8c55-4c1e-9d7e-3f2a1c9b8e77';
const ME = 4242;
const OTHER = 5151;
const NOW = Date.parse('2026-10-24T12:00:00.000Z');

const PULLED: Pulled = {
	notes: [
		{
			id: 'n1',
			topicId: TOPIC,
			anchor: { path: null },
			intent: 'comment',
			text: 'Looks right.',
			author: '',
			status: 'delivered',
			sentAt: null,
			deliveredAt: null,
			resolvedAt: null,
			reply: '',
			changed: [],
			createdAt: '',
			updatedAt: ''
		}
	],
	unresolved: [],
	context: {},
	stale: []
};

const dirs: string[] = [];
afterEach(() => {
	for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function setup(overrides: Partial<WaitDeps> = {}) {
	const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'beryl-wait-')), 'waits');
	dirs.push(path.dirname(dir));
	const out: string[] = [];
	const err: string[] = [];
	let stop: (() => void) | undefined;
	const unsubscribe = vi.fn();
	const client = {
		waitForSent: vi.fn<
			(input: {
				signal: AbortSignal;
			}) => Promise<{ ok: boolean; value?: unknown; warning?: string }>
		>(async () => ({ ok: true, value: { sent: 2 } })),
		pullNotes: vi.fn(async () => ({ ok: true, value: PULLED }))
	};
	const sleep = vi.fn(async () => {});
	const deps: WaitDeps = {
		client: client as unknown as BerylClient,
		dir,
		pid: ME,
		stdout: (s) => out.push(s),
		stderr: (s) => err.push(s),
		onStop: (fn) => {
			stop = fn;
			return unsubscribe;
		},
		isAlive: (pid) => pid === ME || pid === OTHER,
		now: () => NOW,
		sleep,
		...overrides
	};
	return {
		dir,
		file: pidFile(dir, TOPIC),
		deps,
		client,
		sleep,
		unsubscribe,
		out,
		err,
		stop: () => stop?.()
	};
}

function hold(file: string, pid: number) {
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, JSON.stringify({ pid, startedAt: '2026-10-24T00:00:00.000Z' }));
}

describe('beryl wait', () => {
	it('says another live listener holds the Topic, and leaves its pid file alone', async () => {
		const w = setup();
		hold(w.file, OTHER);

		expect(await runWait(TOPIC, 1000, w.deps)).toBe(0);

		expect(w.out).toEqual([`beryl: already listening for topic ${TOPIC} (pid ${OTHER}).`]);
		expect(w.client.waitForSent).not.toHaveBeenCalled();
		expect(JSON.parse(fs.readFileSync(w.file, 'utf8')).pid).toBe(OTHER);
	});

	it('takes over a pid file whose listener died', async () => {
		const w = setup();
		hold(w.file, 999_999);

		await runWait(TOPIC, 1000, w.deps);

		expect(w.client.waitForSent).toHaveBeenCalled();
	});

	it('holds { pid, startedAt } in <waits>/<topicId>.json while it listens', async () => {
		const w = setup();
		let held: unknown;
		w.client.waitForSent.mockImplementation(async () => {
			held = JSON.parse(fs.readFileSync(path.join(w.dir, `${TOPIC}.json`), 'utf8'));
			return { ok: true, value: { sent: 1 } };
		});

		await runWait(TOPIC, 1000, w.deps);

		expect(held).toEqual({ pid: ME, startedAt: '2026-10-24T12:00:00.000Z' });
		expect((fs.statSync(w.dir).mode & 0o777) === 0o700).toBe(true);
	});

	it('prints the pulled notes and the line to listen again once notes are sent, then removes its pid file', async () => {
		const w = setup();

		expect(await runWait(TOPIC, 43_200_000, w.deps)).toBe(0);

		expect(w.client.waitForSent).toHaveBeenCalledWith({
			topicId: TOPIC,
			timeoutMs: 43_200_000,
			signal: expect.any(AbortSignal)
		});
		expect(w.client.pullNotes).toHaveBeenCalledExactlyOnceWith({ topicId: TOPIC });
		expect(w.out).toEqual([
			[
				`beryl: 1 new note from the board on topic ${TOPIC}:`,
				'- [comment] topic: Looks right. (note n1)',
				'Fold each note into the model, then call resolve_notes with a one-line reply for each.'
			].join('\n'),
			`Run beryl wait ${TOPIC} in the background again once you have resolved them.`
		]);
		expect(fs.existsSync(w.file)).toBe(false);
		expect(w.unsubscribe).toHaveBeenCalled();
	});

	it('pulls a second time when the first pull fails', async () => {
		const w = setup();
		w.client.pullNotes.mockResolvedValueOnce({ ok: false, warning: 'x' } as never);

		await runWait(TOPIC, 1000, w.deps);

		expect(w.client.pullNotes).toHaveBeenCalledTimes(2);
		expect(w.sleep).toHaveBeenCalledTimes(1);
		expect(w.out[0]).toContain('1 new note');
	});

	it('tells the agent to pull when both pulls fail', async () => {
		const w = setup();
		w.client.pullNotes.mockResolvedValue({ ok: false, warning: 'x' } as never);

		expect(await runWait(TOPIC, 1000, w.deps)).toBe(0);

		expect(w.client.pullNotes).toHaveBeenCalledTimes(2);
		expect(w.out).toEqual([
			`beryl: notes were sent for topic ${TOPIC} but could not be pulled; call pull_notes.`
		]);
		expect(fs.existsSync(w.file)).toBe(false);
	});

	it.each([
		[43_200_000, '12h'],
		[90_000, '90s'],
		[1_800_000, '30m']
	])('stops after %i ms with the line to keep listening', async (ms, label) => {
		const w = setup();
		w.client.waitForSent.mockResolvedValue({ ok: true, value: { sent: 0 } });

		expect(await runWait(TOPIC, ms, w.deps)).toBe(0);

		expect(w.out).toEqual([
			`beryl: stopped listening for topic ${TOPIC} after ${label}. Run beryl wait ${TOPIC} in the background to keep listening.`
		]);
		expect(w.client.pullNotes).not.toHaveBeenCalled();
		expect(fs.existsSync(w.file)).toBe(false);
	});

	it('exits silently and removes its pid file on SIGINT or SIGTERM', async () => {
		const w = setup();
		w.client.waitForSent.mockImplementation(
			({ signal }: { signal: AbortSignal }) =>
				new Promise((resolve) => {
					signal.addEventListener('abort', () => resolve({ ok: true, value: { sent: 0 } }));
				}) as never
		);

		const running = runWait(TOPIC, 43_200_000, w.deps);
		await vi.waitFor(() => expect(fs.existsSync(w.file)).toBe(true));
		w.stop();

		expect(await running).toBe(0);
		expect(w.out).toEqual([]);
		expect(w.err).toEqual([]);
		expect(fs.existsSync(w.file)).toBe(false);
		expect(w.unsubscribe).toHaveBeenCalled();
	});

	it('reports a refused wait on stderr, exits 0 and cleans up', async () => {
		const w = setup();
		w.client.waitForSent.mockResolvedValue({
			ok: false,
			warning: 'unknown topic x on this machine'
		} as never);

		expect(await runWait(TOPIC, 1000, w.deps)).toBe(0);

		expect(w.err).toEqual(['beryl: unknown topic x on this machine']);
		expect(fs.existsSync(w.file)).toBe(false);
	});

	it('removes its pid file even when the client throws', async () => {
		const w = setup();
		w.client.waitForSent.mockRejectedValue(new Error('boom'));

		await expect(runWait(TOPIC, 1000, w.deps)).rejects.toThrow('boom');

		expect(fs.existsSync(w.file)).toBe(false);
	});

	it('leaves a pid file another listener took over', async () => {
		const w = setup();
		w.client.waitForSent.mockImplementation(async () => {
			hold(w.file, OTHER);
			return { ok: true, value: { sent: 0 } };
		});

		await runWait(TOPIC, 1000, w.deps);

		expect(JSON.parse(fs.readFileSync(w.file, 'utf8')).pid).toBe(OTHER);
	});
});

describe('waitCommand', () => {
	it('defaults to a 12 hour timeout', async () => {
		const w = setup();

		expect(await waitCommand([TOPIC], w.deps)).toBe(0);
		expect(w.client.waitForSent).toHaveBeenCalledWith(
			expect.objectContaining({ timeoutMs: 43_200_000 })
		);
	});

	it.each([
		['90s', 90_000],
		['0', 0]
	])('reads --timeout %s', async (flag, ms) => {
		const w = setup();

		await waitCommand([TOPIC, '--timeout', flag], w.deps);

		expect(w.client.waitForSent).toHaveBeenCalledWith(expect.objectContaining({ timeoutMs: ms }));
	});

	it.each([[[]], [[TOPIC, '--timeout', '1d']], [[TOPIC, 'extra']], [[TOPIC, '--loud']]])(
		'exits 2 with usage for %j',
		async (argv) => {
			const w = setup();

			expect(await waitCommand(argv, w.deps)).toBe(2);
			expect(w.err.join('\n')).toContain('usage:');
			expect(w.client.waitForSent).not.toHaveBeenCalled();
		}
	);
});

describe('isListening and isAlive', () => {
	it('is true only while the pid in the file is alive', () => {
		const w = setup();
		expect(isListening(w.dir, TOPIC, () => true)).toBe(false);

		hold(w.file, OTHER);
		expect(isListening(w.dir, TOPIC, (pid) => pid === OTHER)).toBe(true);
		expect(isListening(w.dir, TOPIC, () => false)).toBe(false);

		fs.writeFileSync(w.file, 'not json');
		expect(isListening(w.dir, TOPIC, () => true)).toBe(false);
	});

	it('asks the OS with signal 0', () => {
		expect(isAlive(process.pid)).toBe(true);
		expect(isAlive(2 ** 30)).toBe(false);
	});

	it('keeps the pid file name inside the waits dir', () => {
		expect(path.dirname(pidFile('/w', '../../etc/x'))).toBe('/w');
	});
});
