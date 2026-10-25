import { beforeAll, describe, expect, it } from 'vitest';
import fixtureJson from '#lib/fixtures/demo-grill.json' with { type: 'json' };
import type { DemoFixture } from '#lib/fixtures/types.ts';
import { resetDb } from '#lib/server/test/db.ts';
import { api, seedProject, type Body, type Seeded } from '#lib/server/test/http.ts';
import { validateWidget } from '#lib/widgets/validate.ts';

const fixture = fixtureJson as unknown as DemoFixture;

// Replays the demo grill through the HTTP routes in the order DemoTurn documents (pull, resolve,
// remove, move, nodes, topic, then notes and send) and checks every call succeeds: the fixture and
// docs/api.md must agree. A failure here means one of them is wrong; fix the fixture or the
// contract, never this test's expectations, unless the fixture's story itself changed.
async function replay(project: Seeded): Promise<{ topicId: string; noteIds: string[] }> {
	const created = await api.createTopic(project.id, fixture.topic, project.writeKey);
	expect(created.status).toBe(201);
	const topicId: string = created.body.topicId;
	const noteIds: string[] = [];

	for (const [index, turn] of fixture.turns.entries()) {
		const at = `turn ${index + 1}`;
		const ok = (res: { status: number; body: Body }, what: string) =>
			expect(res.status, `${at} ${what}: ${JSON.stringify(res.body)}`).toBeLessThan(300);

		if (turn.pull) ok(await api.pull(topicId, project.writeKey), 'pull');
		if (turn.resolve?.length) {
			const notes = turn.resolve.map((r) => ({
				id: noteIds[r.note],
				reply: r.reply,
				changed: r.changed
			}));
			ok(await api.resolve(topicId, { notes }, project.writeKey), 'resolve');
		}
		if (turn.remove?.length) {
			ok(await api.deleteNodes(topicId, { paths: turn.remove }, project.writeKey), 'remove');
		}
		for (const move of turn.move ?? []) ok(await api.move(topicId, move, project.writeKey), 'move');
		if (turn.nodes?.length) {
			ok(await api.putNodes(topicId, { nodes: turn.nodes }, project.writeKey), 'nodes');
		}
		if (turn.topic) ok(await api.patchTopic(topicId, turn.topic, project.writeKey), 'topic');
		for (const note of turn.notes ?? []) {
			const res = await api.addNote(topicId, note, project.noteKey);
			ok(res, 'note');
			noteIds.push(res.body.note.id);
		}
		if (turn.send) ok(await api.send(topicId, project.noteKey), 'send');
	}
	return { topicId, noteIds };
}

// The status each note ends in, worked out from the turns alone: queued when added, delivered by
// the next pull, resolved once a turn resolves its index.
function expectedStatuses(): string[] {
	const statuses: string[] = [];
	for (const turn of fixture.turns) {
		if (turn.pull) statuses.forEach((s, i) => s === 'queued' && (statuses[i] = 'delivered'));
		for (const r of turn.resolve ?? []) statuses[r.note] = 'resolved';
		for (let n = 0; n < (turn.notes?.length ?? 0); n++) statuses.push('queued');
	}
	return statuses;
}

describe('demo-grill fixture replay', () => {
	let snapshot: Body;
	let noteIds: string[];

	beforeAll(async () => {
		await resetDb();
		const project = await seedProject(fixture.project.name);
		const result = await replay(project);
		noteIds = result.noteIds;
		snapshot = (await api.getTopic(result.topicId)).body;
	}, 60_000);

	it('ends with current on permissions/roles', () => {
		expect(snapshot.topic.current).toBe('permissions/roles');
		expect(snapshot.topic.title).toBe(fixture.topic.title);
	});

	it('holds all 12 notes, in the statuses the turns imply', () => {
		const expected = expectedStatuses();
		expect(snapshot.notes).toHaveLength(12);
		expect(expected).toHaveLength(12);
		const byId = new Map(snapshot.notes.map((note: Body) => [note.id, note]));
		expect(noteIds.map((id) => (byId.get(id) as Body).status)).toEqual(expected);
	});

	it('resolves every note, since turn 5 resolves the two that turn 4 added', () => {
		expect(expectedStatuses()).toEqual(Array(12).fill('resolved'));
		const byId = new Map(snapshot.notes.map((note: Body) => [note.id, note]));
		for (const [turnIndex, turn] of fixture.turns.entries()) {
			for (const r of turn.resolve ?? []) {
				const note = byId.get(noteIds[r.note]) as Body;
				expect(note, `turn ${turnIndex + 1} note ${r.note}`).toMatchObject({
					status: 'resolved',
					reply: r.reply,
					changed: r.changed ?? []
				});
				expect(note.deliveredAt).not.toBeNull();
			}
		}
	});

	it('stamps sentAt only on notes added in turns that pressed Send', () => {
		const sent: boolean[] = [];
		for (const turn of fixture.turns) {
			for (let n = 0; n < (turn.notes?.length ?? 0); n++) sent.push(Boolean(turn.send));
		}
		const byId = new Map(snapshot.notes.map((note: Body) => [note.id, note]));
		expect(noteIds.map((id) => (byId.get(id) as Body).sentAt !== null)).toEqual(sent);
	});

	it('holds exactly the paths the turns leave written, with their ancestors', () => {
		const expected = new Set<string>();
		for (const turn of fixture.turns) {
			for (const path of turn.remove ?? []) {
				for (const p of [...expected])
					if (p === path || p.startsWith(`${path}/`)) expected.delete(p);
			}
			for (const node of turn.nodes ?? []) {
				const segments = node.path.split('/');
				segments.forEach((_, i) => expected.add(segments.slice(0, i + 1).join('/')));
			}
		}
		expect(snapshot.nodes.map((node: Body) => node.path).sort()).toEqual([...expected].sort());
	});

	it('stores only widgets that pass validateWidget, and every fixture widget passes it', () => {
		const stored = snapshot.nodes.flatMap((node: Body) => node.widgets as unknown[]);
		expect(stored.length).toBeGreaterThan(0);
		for (const widget of stored) expect(validateWidget(widget)).toMatchObject({ ok: true });

		const all = fixture.turns.flatMap((t) => (t.nodes ?? []).flatMap((n) => n.widgets ?? []));
		const types = new Set(all.map((w) => w.type));
		expect([...types].sort()).toEqual([
			'api',
			'classes',
			'code',
			'files',
			'markdown',
			'migration',
			'options',
			'schema',
			'sequence',
			'states',
			'table'
		]);
		for (const widget of all) {
			const result = validateWidget(widget);
			expect(result, `${widget.key} (${widget.type})`).toEqual({ ok: true, widget });
		}
	});
});
