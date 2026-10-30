import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '#lib/server/db/index.ts';
import { pairings, sessions } from '#lib/server/db/schema.ts';
import { hashKey } from '#lib/server/hash.ts';
import {
	ACTION_WINDOW_MS,
	PAIRING_TTL_MS,
	SESSION_TTL_MS,
	createPairing,
	pruneExpired,
	redeemPairing,
	refreshSession
} from '#lib/server/sessions.ts';
import { resetDb } from '#lib/server/test/db.ts';
import { api, seedProject, seedTopic, type Seeded } from '#lib/server/test/http.ts';

let project: Seeded;
let topicId: string;

const addNote = (key?: string) =>
	api.addNote(topicId, { anchor: { path: null }, intent: 'comment', text: 'hi' }, key);

const rowOf = async (token: string) => {
	const [row] = await db
		.select()
		.from(sessions)
		.where(eq(sessions.tokenHash, hashKey(token)));
	return row;
};

const setSession = (token: string, patch: Partial<typeof sessions.$inferInsert>) =>
	db
		.update(sessions)
		.set(patch)
		.where(eq(sessions.tokenHash, hashKey(token)));

const ago = (ms: number) => new Date(Date.now() - ms);

beforeEach(async () => {
	await resetDb();
	project = await seedProject();
	({ topicId } = await seedTopic(project));
});

describe('POST /api/projects/:id/pairings', () => {
	it('mints a code with the Write key', async () => {
		const res = await api.createPairing(project.id, project.writeKey);
		expect(res.status).toBe(201);
		expect(res.body.code).toMatch(/^bp_[A-Za-z0-9_-]{43}$/);
		expect(new Date(res.body.expiresAt).getTime()).toBeGreaterThan(Date.now());
	});

	it('refuses a missing key, a session token and a wrong key', async () => {
		expect((await api.createPairing(project.id)).status).toBe(401);
		expect((await api.createPairing(project.id, project.noteKey)).status).toBe(403);
		expect((await api.createPairing(project.id, 'bw_nope')).status).toBe(403);
	});

	it('stores only the sha256 of the code', async () => {
		const { code } = (await api.createPairing(project.id, project.writeKey)).body;
		const rows = await db.select().from(pairings);
		expect(rows.map((r) => r.codeHash)).toContain(hashKey(code));
		expect(JSON.stringify(rows)).not.toContain(code);
	});
});

describe('POST /api/pairings/redeem', () => {
	it('exchanges a code for a session token on the same project', async () => {
		const { code } = (await api.createPairing(project.id, project.writeKey)).body;
		const res = await api.redeem({ code });
		expect(res.status).toBe(200);
		expect(res.body).toMatchObject({ projectId: project.id, token: expect.stringMatching(/^bs_/) });
		expect((await addNote(res.body.token)).status).toBe(201);
	});

	it('redeems a code once', async () => {
		const { code } = (await api.createPairing(project.id, project.writeKey)).body;
		expect((await api.redeem({ code })).status).toBe(200);
		expect((await api.redeem({ code })).status).toBe(403);
	});

	it('lets only one of concurrent redemptions win', async () => {
		const { code } = (await api.createPairing(project.id, project.writeKey)).body;
		const results = await Promise.all(Array.from({ length: 6 }, () => api.redeem({ code })));
		expect(results.filter((r) => r.status === 200)).toHaveLength(1);
	});

	it('refuses an expired code', async () => {
		const { code } = await createPairing(project.id, new Date(Date.now() - PAIRING_TTL_MS - 1));
		expect((await api.redeem({ code })).status).toBe(403);
	});

	it('refuses an unknown code and a missing one', async () => {
		expect((await api.redeem({ code: 'bp_nope' })).status).toBe(403);
		expect((await api.redeem({})).status).toBe(400);
	});
});

describe('session on note routes', () => {
	it('accepts the Write key as well as a session token', async () => {
		expect((await addNote(project.writeKey)).status).toBe(201);
		expect((await addNote(project.noteKey)).status).toBe(201);
	});

	it('refuses a session token on write routes', async () => {
		const res = await api.putNodes(topicId, { nodes: [] }, project.noteKey);
		expect(res.status).toBe(403);
		expect((await api.pull(topicId, project.noteKey)).status).toBe(403);
	});

	it("refuses another project's session", async () => {
		const other = await seedProject('other');
		expect((await addNote(other.noteKey)).status).toBe(403);
	});

	it('answers 401 session expired once the token lapses', async () => {
		await setSession(project.noteKey, { expiresAt: ago(1) });
		const res = await addNote(project.noteKey);
		expect(res.status).toBe(401);
		expect(res.body.error).toBe('session expired');
	});

	it('runs a full TTL from every action', async () => {
		await setSession(project.noteKey, { expiresAt: new Date(Date.now() + 1000) });
		expect((await addNote(project.noteKey)).status).toBe(201);
		const row = await rowOf(project.noteKey);
		expect(row.expiresAt.getTime()).toBeGreaterThan(Date.now() + SESSION_TTL_MS - 5000);
		expect(Date.now() - row.lastActionAt.getTime()).toBeLessThan(5000);
	});
});

describe('POST /api/session (refresh)', () => {
	it('extends a live session without counting as an action', async () => {
		const soon = new Date(Date.now() + 60_000);
		const acted = ago(5 * 60_000);
		await setSession(project.noteKey, { expiresAt: soon, lastActionAt: acted });
		const res = await api.refresh(project.noteKey);
		expect(res.status).toBe(200);
		const row = await rowOf(project.noteKey);
		expect(row.expiresAt.getTime()).toBeGreaterThan(soon.getTime());
		expect(row.lastActionAt.getTime()).toBe(acted.getTime());
	});

	it('never runs past the action window', async () => {
		const acted = ago(ACTION_WINDOW_MS - 2 * 60_000);
		await setSession(project.noteKey, {
			lastActionAt: acted,
			expiresAt: new Date(Date.now() + 30_000)
		});
		const res = await api.refresh(project.noteKey);
		expect(new Date(res.body.expiresAt).getTime()).toBe(acted.getTime() + ACTION_WINDOW_MS);
	});

	it('never shortens an expiry an action already set', async () => {
		const later = new Date(Date.now() + SESSION_TTL_MS);
		await setSession(project.noteKey, {
			lastActionAt: ago(ACTION_WINDOW_MS - 60_000),
			expiresAt: later
		});
		const res = await api.refresh(project.noteKey);
		expect(new Date(res.body.expiresAt).getTime()).toBe(later.getTime());
		expect((await rowOf(project.noteKey)).expiresAt.getTime()).toBe(later.getTime());
	});

	it('keeps every session alive when actions and renewals interleave', async () => {
		const calls = Array.from({ length: 10 }, (_, i) =>
			i % 2 ? api.refresh(project.noteKey) : addNote(project.noteKey)
		);
		const results = await Promise.all(calls);
		expect(results.every((r) => r.status < 300)).toBe(true);
		const row = await rowOf(project.noteKey);
		expect(row.expiresAt.getTime()).toBeGreaterThan(Date.now() + SESSION_TTL_MS - 10_000);
	});

	it('refuses once the action window has closed', async () => {
		await setSession(project.noteKey, {
			lastActionAt: ago(ACTION_WINDOW_MS + 1000),
			expiresAt: new Date(Date.now() + 60_000)
		});
		const res = await api.refresh(project.noteKey);
		expect(res.status).toBe(401);
		expect(res.body.error).toBe('session idle');
	});

	it('does not revive a lapsed session', async () => {
		await setSession(project.noteKey, { expiresAt: ago(1) });
		const res = await api.refresh(project.noteKey);
		expect(res.status).toBe(401);
		expect(res.body.error).toBe('session expired');
	});

	it('refuses a missing key, the Write key and unknown tokens', async () => {
		expect((await api.refresh()).status).toBe(401);
		expect((await api.refresh(project.writeKey)).status).toBe(401);
		expect((await api.refresh('bs_nope')).status).toBe(401);
	});
});

describe('sessions module', () => {
	it('prunes lapsed sessions and codes on demand', async () => {
		await setSession(project.noteKey, { expiresAt: ago(1) });
		await db.insert(pairings).values({
			codeHash: hashKey('bp_stale'),
			projectId: project.id,
			expiresAt: ago(1)
		});
		await pruneExpired();
		expect(await rowOf(project.noteKey)).toBeUndefined();
		expect(await db.select().from(pairings)).toHaveLength(0);
	});

	it('prunes lapsed sessions when a code is redeemed', async () => {
		await setSession(project.noteKey, { expiresAt: ago(1) });
		const { code } = await createPairing(project.id);
		await redeemPairing(code);
		expect(await rowOf(project.noteKey)).toBeUndefined();
	});

	it('refreshSession is capped by an injected clock', async () => {
		const { code } = await createPairing(project.id);
		const { token } = await redeemPairing(code);
		const later = new Date(Date.now() + ACTION_WINDOW_MS + 1);
		await setSession(token, { expiresAt: new Date(later.getTime() + 1000) });
		await expect(refreshSession(token, later)).rejects.toMatchObject({ status: 401 });
	});
});
