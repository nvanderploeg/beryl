import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listenerCount } from './bus.ts';
import { resetDb } from './test/db.ts';
import { api, seedProject, seedTopic, type Seeded } from './test/http.ts';
import { waitForSent } from './wait.ts';

let project: Seeded;
let topicId: string;

const addNote = () =>
	api.addNote(topicId, { anchor: { path: null }, intent: 'comment', text: 'hi' }, project.noteKey);

beforeEach(async () => {
	await resetDb();
	project = await seedProject();
	({ topicId } = await seedTopic(project));
});

afterEach(() => {
	vi.useRealTimers();
});

describe('waitForSent', () => {
	it('answers at once with the count of sent notes still queued', async () => {
		await addNote();
		await addNote();
		await api.send(topicId, project.noteKey);
		await addNote();

		const started = performance.now();
		expect(await waitForSent(topicId, 5000)).toBe(2);
		expect(performance.now() - started).toBeLessThan(1000);
		expect(listenerCount(topicId)).toBe(0);
	});

	it('ignores notes that are queued but not sent, and sent notes already pulled', async () => {
		await addNote();
		await api.send(topicId, project.noteKey);
		await api.pull(topicId, project.writeKey);
		await addNote();

		expect(await waitForSent(topicId, 100)).toBe(0);
	});

	it("resolves on the topic's next send with its count", async () => {
		const waiting = waitForSent(topicId, 5000);
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(listenerCount(topicId)).toBe(1);

		await addNote();
		await api.send(topicId, project.noteKey);

		expect(await waiting).toBe(1);
		expect(listenerCount(topicId)).toBe(0);
	});

	it('does not wake for another topic or for non-send events', async () => {
		const other = await seedTopic(project);
		const waiting = waitForSent(topicId, 300);

		await addNote();
		await api.addNote(other.topicId, { anchor: { path: null }, intent: 'accept' }, project.noteKey);
		await api.send(other.topicId, project.noteKey);

		expect(await waiting).toBe(0);
	});

	it('answers 0 at the timeout and leaves no listener or timer behind', async () => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		const waiting = waitForSent(topicId, 10_000);
		await vi.waitFor(() => expect(listenerCount(topicId)).toBe(1));

		await vi.advanceTimersByTimeAsync(10_000);

		expect(await waiting).toBe(0);
		expect(listenerCount(topicId)).toBe(0);
		expect(vi.getTimerCount()).toBe(0);
	});

	it('stops at once when the client goes away, leaving no listener or timer behind', async () => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		const controller = new AbortController();
		const waiting = waitForSent(topicId, 60_000, controller.signal);
		await vi.waitFor(() => expect(listenerCount(topicId)).toBe(1));

		controller.abort();

		expect(await waiting).toBe(0);
		expect(listenerCount(topicId)).toBe(0);
		expect(vi.getTimerCount()).toBe(0);
	});

	it('answers 0 without subscribing for long when the signal is already aborted', async () => {
		const controller = new AbortController();
		controller.abort();
		expect(await waitForSent(topicId, 60_000, controller.signal)).toBe(0);
		expect(listenerCount(topicId)).toBe(0);
	});
});

describe('GET /api/topics/:id/wait', () => {
	it('answers at once when sent notes are waiting', async () => {
		await addNote();
		await api.send(topicId, project.noteKey);

		const res = await api.wait(topicId, project.writeKey);

		expect(res.status).toBe(200);
		expect(res.body).toEqual({ sent: 1 });
	});

	it('answers on the next send', async () => {
		const waiting = api.wait(topicId, project.writeKey, '?timeoutMs=10000');
		await vi.waitFor(() => expect(listenerCount(topicId)).toBe(1));

		await addNote();
		await addNote();
		await api.send(topicId, project.noteKey);

		expect((await waiting).body).toEqual({ sent: 2 });
	});

	it('clamps timeoutMs to at least 1000 and answers sent 0 when it runs out', async () => {
		const started = performance.now();
		const res = await api.wait(topicId, project.writeKey, '?timeoutMs=5');
		const elapsed = performance.now() - started;

		expect(res.body).toEqual({ sent: 0 });
		expect(elapsed).toBeGreaterThanOrEqual(950);
		expect(elapsed).toBeLessThan(3000);
	});

	it('cleans up when the request is aborted', async () => {
		const controller = new AbortController();
		const waiting = api.wait(topicId, project.writeKey, '?timeoutMs=60000', controller.signal);
		await vi.waitFor(() => expect(listenerCount(topicId)).toBe(1));

		controller.abort();

		expect((await waiting).body).toEqual({ sent: 0 });
		expect(listenerCount(topicId)).toBe(0);
	});

	it('rejects a malformed timeoutMs and needs the Write key', async () => {
		expect((await api.wait(topicId, project.writeKey, '?timeoutMs=soon')).status).toBe(400);
		expect((await api.wait(topicId, project.noteKey)).status).toBe(403);
		expect((await api.wait(topicId)).status).toBe(401);
	});
});
