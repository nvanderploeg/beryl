import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTopicStream } from './stream.ts';
import { resetDb } from './test/db.ts';
import { api, seedProject, seedTopic } from './test/http.ts';

const TIMED_OUT = Symbol('timed out');

interface Frame {
	id?: string;
	event?: string;
	data?: string;
	comment?: string;
}

function parseFrames(text: string): Frame[] {
	return text
		.split('\n\n')
		.slice(0, -1)
		.map((block) => {
			const frame: Frame = {};
			for (const line of block.split('\n')) {
				if (line.startsWith(':')) {
					frame.comment = line.slice(1).trim();
					continue;
				}
				const colon = line.indexOf(':');
				const field = line.slice(0, colon);
				const value = line.slice(colon + 1).replace(/^ /, '');
				if (field === 'id') frame.id = value;
				else if (field === 'event') frame.event = value;
				else if (field === 'data') frame.data = value;
			}
			return frame;
		});
}

const eventFrames = (frames: Frame[]) => frames.filter((f) => f.event !== undefined);
const payloadOf = (frame: Frame) => JSON.parse(frame.data ?? 'null');
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
		timer = setTimeout(resolve, ms, TIMED_OUT);
	});
	return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function collect(stream: ReadableStream<Uint8Array>) {
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	const openedAt = performance.now();
	let buffer = '';
	let finished = false;
	let pending: Promise<ReadableStreamReadResult<Uint8Array>> | null = null;

	async function step(deadline: number): Promise<'data' | 'done' | 'timeout'> {
		const remaining = deadline - performance.now();
		if (remaining <= 0) return 'timeout';
		pending ??= reader.read();
		const result = await withTimeout(pending, remaining);
		if (result === TIMED_OUT) return 'timeout';
		pending = null;
		if (result.done) {
			finished = true;
			return 'done';
		}
		buffer += decoder.decode(result.value, { stream: true });
		return 'data';
	}

	return {
		frames: () => parseFrames(buffer),
		text: () => buffer,
		elapsed: () => performance.now() - openedAt,
		async waitFor(match: (frames: Frame[]) => boolean, timeoutMs = 1000): Promise<boolean> {
			const deadline = performance.now() + timeoutMs;
			while (!match(parseFrames(buffer))) {
				if (finished) return false;
				if ((await step(deadline)) === 'timeout') return false;
			}
			return true;
		},
		async closed(timeoutMs = 1000): Promise<boolean> {
			const deadline = performance.now() + timeoutMs;
			while (!finished) {
				if ((await step(deadline)) === 'timeout') return false;
			}
			return true;
		},
		async cancel(): Promise<void> {
			finished = true;
			await reader.cancel().catch(() => {});
		}
	};
}

type Collector = ReturnType<typeof collect>;
const live: Collector[] = [];

function track(stream: ReadableStream<Uint8Array>): Collector {
	const collector = collect(stream);
	live.push(collector);
	return collector;
}

async function settle(c: Collector, ms: number): Promise<void> {
	await c.waitFor(() => false, ms);
}

async function readEvents(c: Collector, count: number): Promise<Frame[]> {
	const reached = await c.waitFor((frames) => eventFrames(frames).length >= count, 1000);
	expect(reached).toBe(true);
	await settle(c, 50);
	return eventFrames(c.frames());
}

async function seed(): Promise<{ topicId: string; writeKey: string }> {
	const project = await seedProject();
	const { topicId } = await seedTopic(project, {
		nodes: [
			{ path: 'a', kind: 'fact' },
			{ path: 'b', kind: 'fact' }
		]
	});
	return { topicId, writeKey: project.writeKey };
}

async function putNode(topicId: string, writeKey: string, path: string, gist: string) {
	const res = await api.putNodes(topicId, { nodes: [{ path, gist, kind: 'fact' }] }, writeKey);
	expect(res.status).toBe(200);
}

function bodyOf(res: Response): Collector {
	expect(res.body).not.toBeNull();
	return track(res.body!);
}

async function openStream(
	topicId: string,
	options: { since?: number; idleMs?: number; heartbeatMs?: number; now?: () => number }
): Promise<Collector> {
	const stream = await createTopicStream(topicId, options);
	expect(stream).not.toBeNull();
	return track(stream!);
}

beforeEach(async () => {
	await resetDb();
});

afterEach(async () => {
	await Promise.all(live.splice(0).map((c) => c.cancel()));
});

describe('createTopicStream', () => {
	it('resolves to null for a topic that does not exist', async () => {
		const stream = await createTopicStream(randomUUID(), { idleMs: 200, heartbeatMs: 50 });
		expect(stream).toBeNull();
	});

	it('opens with ": ok" before anything else', async () => {
		const { topicId } = await seed();
		const c = await openStream(topicId, { since: 0, idleMs: 5000, heartbeatMs: 10_000 });
		await readEvents(c, 3);
		expect(c.text().startsWith(': ok\n\n')).toBe(true);
	});

	it('replays every event with seq > since in order, with its type and row payload', async () => {
		const { topicId } = await seed();

		const c = await openStream(topicId, { since: 0, idleMs: 5000, heartbeatMs: 10_000 });
		const frames = await readEvents(c, 3);

		expect(frames.map((f) => f.event)).toEqual(['topic', 'node', 'node']);
		const ids = frames.map((f) => Number(f.id));
		expect(ids.every(Number.isInteger)).toBe(true);
		expect(ids).toEqual([...ids].sort((x, y) => x - y));
		const [topic, a, b] = frames.map(payloadOf);
		expect(topic).toMatchObject({ id: topicId, title: 'Spec topic', status: 'open' });
		expect(a).toMatchObject({ topicId, path: 'a', kind: 'fact', status: 'settled' });
		expect(b).toMatchObject({ topicId, path: 'b' });
		for (const row of [topic, a, b]) {
			expect(row).not.toHaveProperty('seq');
			expect(row).not.toHaveProperty('payload');
		}
	});

	it('replays only events after since', async () => {
		const { topicId } = await seed();
		const all = await readEvents(
			await openStream(topicId, { since: 0, idleMs: 5000, heartbeatMs: 10_000 }),
			3
		);
		const ids = all.map((f) => Number(f.id));

		const later = await readEvents(
			await openStream(topicId, { since: ids[0], idleMs: 5000, heartbeatMs: 10_000 }),
			2
		);
		expect(later.map((f) => Number(f.id))).toEqual([ids[1], ids[2]]);
	});

	it('sends only live events without since, pushing a write as it is published', async () => {
		const { topicId, writeKey } = await seed();

		const c = await openStream(topicId, { idleMs: 5000, heartbeatMs: 10_000 });
		await putNode(topicId, writeKey, 'a', 'half way');

		expect(await c.waitFor((frames) => eventFrames(frames).length >= 1, 1000)).toBe(true);
		await settle(c, 30);
		const frames = eventFrames(c.frames());
		expect(frames.map((f) => f.event)).toEqual(['node']);
		expect(payloadOf(frames[0])).toMatchObject({ topicId, path: 'a', gist: 'half way' });
	});

	it('never delivers events written to a different topic', async () => {
		const first = await seed();
		const second = await seed();

		const c = await openStream(first.topicId, { idleMs: 5000, heartbeatMs: 10_000 });
		await putNode(second.topicId, second.writeKey, 'a', 'elsewhere');
		await putNode(first.topicId, first.writeKey, 'b', 'here');

		expect(
			await c.waitFor(
				(frames) => eventFrames(frames).some((f) => payloadOf(f).gist === 'here'),
				1000
			)
		).toBe(true);
		await settle(c, 50);
		expect(eventFrames(c.frames()).map((f) => f.event)).toEqual(['node']);
		expect(c.text()).not.toContain(second.topicId);
	});

	it('delivers an event written while replay runs exactly once, with no gap', async () => {
		const { topicId, writeKey } = await seed();

		const c = await openStream(topicId, { since: 0, idleMs: 5000, heartbeatMs: 10_000 });
		await putNode(topicId, writeKey, 'a', 'one');
		await putNode(topicId, writeKey, 'b', 'two');

		const frames = await readEvents(c, 5);
		expect(frames.map((f) => f.event)).toEqual(['topic', 'node', 'node', 'node', 'node']);
		const ids = frames.map((f) => Number(f.id));
		expect(ids).toEqual([ids[0], ids[0] + 1, ids[0] + 2, ids[0] + 3, ids[0] + 4]);
	});

	it('sends a ": ping" comment roughly every heartbeatMs', async () => {
		const { topicId } = await seed();

		const c = await openStream(topicId, { heartbeatMs: 50, idleMs: 5000 });
		const pings = (frames: Frame[]) => frames.filter((f) => f.comment === 'ping');

		expect(await c.waitFor((frames) => pings(frames).length >= 1, 1000)).toBe(true);
		const firstAt = c.elapsed();
		expect(await c.waitFor((frames) => pings(frames).length >= 2, 1000)).toBe(true);
		const secondAt = c.elapsed();

		expect(firstAt).toBeGreaterThanOrEqual(20);
		expect(firstAt).toBeLessThan(500);
		expect(secondAt - firstAt).toBeGreaterThanOrEqual(15);
		expect(secondAt - firstAt).toBeLessThan(400);
		expect(c.text()).toContain(': ping\n\n');
	});

	it('emits event: idle and then closes after idleMs with no writes', async () => {
		const { topicId } = await seed();

		const c = await openStream(topicId, { idleMs: 200, heartbeatMs: 10_000 });
		expect(await c.waitFor((frames) => frames.some((f) => f.event === 'idle'), 1000)).toBe(true);
		expect(c.elapsed()).toBeGreaterThanOrEqual(150);
		expect(c.text()).toContain('event: idle\ndata: {}\n\n');
		expect(await c.closed(500)).toBe(true);
	});

	it('pushes the idle deadline out on every published event', async () => {
		const { topicId, writeKey } = await seed();

		const c = await openStream(topicId, { idleMs: 300, heartbeatMs: 10_000 });
		await sleep(120);
		await putNode(topicId, writeKey, 'a', 'kept alive');

		expect(await c.waitFor((frames) => frames.some((f) => f.event === 'idle'), 1500)).toBe(true);
		expect(c.elapsed()).toBeGreaterThanOrEqual(380);
		expect(eventFrames(c.frames()).map((f) => f.event)).toEqual(['node', 'idle']);
	});

	it("starts the idle window at the topic's updatedAt when that is later than now", async () => {
		const { topicId } = await seed();
		const opened = Date.now();

		const c = await openStream(topicId, {
			idleMs: 200,
			heartbeatMs: 10_000,
			now: () => opened - 1000
		});
		expect(await c.waitFor((frames) => frames.some((f) => f.event === 'idle'), 600)).toBe(false);
		expect(await c.waitFor((frames) => frames.some((f) => f.event === 'idle'), 1500)).toBe(true);
	});

	it('gives a topic whose last write is long past a full idleMs window from open', async () => {
		const { topicId } = await seed();
		await sleep(300);

		const c = await openStream(topicId, { idleMs: 200, heartbeatMs: 10_000 });
		expect(await c.waitFor((frames) => frames.some((f) => f.event === 'idle'), 120)).toBe(false);
		expect(await c.waitFor((frames) => frames.some((f) => f.event === 'idle'), 1000)).toBe(true);
		expect(c.elapsed()).toBeGreaterThanOrEqual(150);
	});

	it('stops publishing and timers once the reader is cancelled', async () => {
		const { topicId, writeKey } = await seed();

		const stream = await createTopicStream(topicId, { idleMs: 100, heartbeatMs: 30 });
		expect(stream).not.toBeNull();
		const reader = stream!.getReader();
		const opening = await reader.read();
		expect(new TextDecoder().decode(opening.value)).toBe(': ok\n\n');
		const first = await reader.read();
		expect(new TextDecoder().decode(first.value)).toContain(': ping\n\n');

		await reader.cancel();
		expect((await reader.read()).done).toBe(true);

		await putNode(topicId, writeKey, 'a', 'after cancel');
		await sleep(300);
		expect((await reader.read()).done).toBe(true);
	});
});

describe('GET /api/topics/:id/stream', () => {
	it('answers 404 with a JSON error for an unknown topic', async () => {
		const res = await api.stream(randomUUID());
		expect(res.status).toBe(404);
		expect(res.headers.get('content-type')).toContain('application/json');
		expect(await res.json()).toEqual({ error: 'topic not found' });
	});

	it('answers 400 for a malformed topic id or since', async () => {
		expect((await api.stream('not-a-uuid')).status).toBe(400);
		const { topicId } = await seed();
		expect((await api.stream(topicId, { since: 'x' })).status).toBe(400);
	});

	it('answers 200 with the SSE headers', async () => {
		const { topicId } = await seed();

		const res = await api.stream(topicId);
		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toBe('text/event-stream');
		expect(res.headers.get('cache-control')).toBe('no-cache');
		expect(res.headers.get('x-accel-buffering')).toBe('no');
		await res.body?.cancel();
	});

	it('replays events after ?since=', async () => {
		const { topicId } = await seed();
		const frames = await readEvents(bodyOf(await api.stream(topicId, { since: '0' })), 3);
		expect(frames.map((f) => f.event)).toEqual(['topic', 'node', 'node']);
	});

	it('replays events after the Last-Event-ID header, which wins over ?since=', async () => {
		const { topicId } = await seed();
		const all = await readEvents(bodyOf(await api.stream(topicId, { since: '0' })), 3);
		const ids = all.map((f) => Number(f.id));

		const byHeader = await readEvents(
			bodyOf(await api.stream(topicId, { lastEventId: String(ids[0]) })),
			2
		);
		expect(byHeader.map((f) => Number(f.id))).toEqual([ids[1], ids[2]]);

		const both = await readEvents(
			bodyOf(await api.stream(topicId, { since: '0', lastEventId: String(ids[1]) })),
			1
		);
		expect(both.map((f) => Number(f.id))).toEqual([ids[2]]);
	});
});
