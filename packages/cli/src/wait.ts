import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { formatPulled, type BerylClient } from '@beryl/client';
import { USAGE, UsageError, formatDuration, parse, parseDuration } from './args.ts';

export interface WaitDeps {
	client: BerylClient;
	dir: string;
	pid: number;
	stdout: (s: string) => void;
	stderr: (s: string) => void;
	onStop: (stop: () => void) => () => void;
	isAlive?: (pid: number) => boolean;
	now?: () => number;
	sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_TIMEOUT = '12h';
const PULL_RETRY_MS = 1000;

export function pidFile(dir: string, topicId: string): string {
	return join(dir, `${topicId.replace(/[^\w-]/g, '_')}.json`);
}

export function isAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return (error as NodeJS.ErrnoException).code === 'EPERM';
	}
}

function readHolder(file: string): { pid: number } | null {
	try {
		const parsed = JSON.parse(readFileSync(file, 'utf8')) as { pid?: unknown };
		return typeof parsed?.pid === 'number' && Number.isInteger(parsed.pid) && parsed.pid > 0
			? { pid: parsed.pid }
			: null;
	} catch {
		return null;
	}
}

export function isListening(dir: string, topicId: string, alive = isAlive): boolean {
	const holder = readHolder(pidFile(dir, topicId));
	return holder !== null && alive(holder.pid);
}

function claim(
	file: string,
	pid: number,
	startedAt: string,
	alive: (pid: number) => boolean
): { ok: true } | { ok: false; pid: number } {
	mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
	for (let attempt = 0; attempt < 3; attempt++) {
		try {
			writeFileSync(file, JSON.stringify({ pid, startedAt }) + '\n', { flag: 'wx', mode: 0o600 });
			return { ok: true };
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
			const holder = readHolder(file);
			if (holder && holder.pid !== pid && alive(holder.pid)) return { ok: false, pid: holder.pid };
			rmSync(file, { force: true });
		}
	}
	throw new Error(`cannot claim ${file}`);
}

function release(file: string, pid: number): void {
	try {
		if (readHolder(file)?.pid === pid) rmSync(file, { force: true });
	} catch {
		return;
	}
}

export async function runWait(topicId: string, timeoutMs: number, deps: WaitDeps): Promise<number> {
	const alive = deps.isAlive ?? isAlive;
	const now = deps.now ?? Date.now;
	const sleep = deps.sleep ?? ((ms: number) => delay(ms));
	const file = pidFile(deps.dir, topicId);

	const claimed = claim(file, deps.pid, new Date(now()).toISOString(), alive);
	if (!claimed.ok) {
		deps.stdout(`beryl: already listening for topic ${topicId} (pid ${claimed.pid}).`);
		return 0;
	}

	const controller = new AbortController();
	const unsubscribe = deps.onStop(() => controller.abort());
	try {
		const waited = await deps.client.waitForSent({
			topicId,
			timeoutMs,
			signal: controller.signal
		});
		if (controller.signal.aborted) return 0;
		if (!waited.ok) {
			deps.stderr(`beryl: ${waited.warning}`);
			return 0;
		}
		if (waited.value.sent === 0) {
			deps.stdout(
				`beryl: stopped listening for topic ${topicId} after ${formatDuration(timeoutMs)}. Run beryl wait ${topicId} in the background to keep listening.`
			);
			return 0;
		}

		let pulled = await deps.client.pullNotes({ topicId });
		if (!pulled.ok) {
			await sleep(PULL_RETRY_MS);
			pulled = await deps.client.pullNotes({ topicId });
		}
		if (!pulled.ok) {
			deps.stdout(
				`beryl: notes were sent for topic ${topicId} but could not be pulled; call pull_notes.`
			);
			return 0;
		}
		deps.stdout(formatPulled(pulled.value, { id: topicId }));
		deps.stdout(`Run beryl wait ${topicId} in the background again once you have resolved them.`);
		return 0;
	} finally {
		unsubscribe();
		release(file, deps.pid);
	}
}

export async function waitCommand(argv: string[], deps: WaitDeps): Promise<number> {
	try {
		const { values, positionals } = parse(argv, { timeout: { type: 'string' } }, [1, 1]);
		const timeoutMs = parseDuration(values.timeout ?? DEFAULT_TIMEOUT);
		return await runWait(positionals[0], timeoutMs, deps);
	} catch (error) {
		if (error instanceof UsageError) {
			deps.stderr(`beryl: ${error.message}\n${USAGE}`);
			return 2;
		}
		deps.stderr(`beryl: ${error instanceof Error ? error.message : String(error)}`);
		return 0;
	}
}
