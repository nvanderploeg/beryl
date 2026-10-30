import { randomBytes } from 'node:crypto';
import { and, eq, gt, lt } from 'drizzle-orm';
import { ApiError } from '#lib/server/api.ts';
import { db } from '#lib/server/db/index.ts';
import { pairings, sessions } from '#lib/server/db/schema.ts';
import { hashKey } from '#lib/server/hash.ts';

export const PAIRING_TTL_MS = 5 * 60_000;
export const SESSION_TTL_MS = 10 * 60_000;
export const ACTION_WINDOW_MS = 30 * 60_000;

export const SESSION_PREFIX = 'bs_';

const secret = (prefix: string) => `${prefix}${randomBytes(32).toString('base64url')}`;

export async function createPairing(
	projectId: string,
	now = new Date()
): Promise<{ code: string; expiresAt: Date }> {
	const code = secret('bp_');
	const expiresAt = new Date(now.getTime() + PAIRING_TTL_MS);
	await db.insert(pairings).values({ codeHash: hashKey(code), projectId, expiresAt });
	await pruneExpired(now);
	return { code, expiresAt };
}

// A code redeems once: the delete is the claim, so concurrent redemptions cannot both win.
export async function redeemPairing(
	code: string,
	now = new Date()
): Promise<{ token: string; projectId: string; expiresAt: Date }> {
	const codeHash = hashKey(code);
	const [row] = await db
		.select()
		.from(pairings)
		.where(and(eq(pairings.codeHash, codeHash), gt(pairings.expiresAt, now)));
	const [claim] = row
		? await db.delete(pairings).where(eq(pairings.codeHash, codeHash))
		: [{ affectedRows: 0 }];
	if (!row || claim.affectedRows !== 1) throw new ApiError(403, 'invalid or used code');
	const token = secret(SESSION_PREFIX);
	const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
	await db.insert(sessions).values({
		tokenHash: hashKey(token),
		projectId: row.projectId,
		lastActionAt: now,
		expiresAt
	});
	await pruneExpired(now);
	return { token, projectId: row.projectId, expiresAt };
}

async function sessionRow(token: string) {
	const [row] = await db
		.select()
		.from(sessions)
		.where(eq(sessions.tokenHash, hashKey(token)));
	return row;
}

// A person acted: the session runs another full TTL. One conditional UPDATE, so a
// concurrent renewal cannot interleave.
export async function actOnSession(
	token: string,
	projectId: string,
	now = new Date()
): Promise<void> {
	const tokenHash = hashKey(token);
	const [result] = await db
		.update(sessions)
		.set({ lastActionAt: now, expiresAt: new Date(now.getTime() + SESSION_TTL_MS) })
		.where(
			and(
				eq(sessions.tokenHash, tokenHash),
				eq(sessions.projectId, projectId),
				gt(sessions.expiresAt, now)
			)
		);
	if (result.affectedRows === 1) return;
	const row = await sessionRow(token);
	if (row && row.expiresAt > now) throw new ApiError(403, 'invalid key');
	throw new ApiError(401, 'session expired');
}

// A visible tab keeps the session alive, but never past ACTION_WINDOW_MS after the last action.
// Renewal only ever lengthens: an action that lands mid-renewal keeps its later expiry.
export async function refreshSession(token: string, now = new Date()): Promise<Date> {
	const row = await sessionRow(token);
	if (!row || row.expiresAt <= now) throw new ApiError(401, 'session expired');
	const limit = row.lastActionAt.getTime() + ACTION_WINDOW_MS;
	if (limit <= now.getTime()) throw new ApiError(401, 'session idle');
	const expiresAt = new Date(Math.min(now.getTime() + SESSION_TTL_MS, limit));
	await db
		.update(sessions)
		.set({ expiresAt })
		.where(and(eq(sessions.tokenHash, row.tokenHash), lt(sessions.expiresAt, expiresAt)));
	return (await sessionRow(token))?.expiresAt ?? expiresAt;
}

export async function pruneExpired(now = new Date()): Promise<void> {
	await db.delete(pairings).where(lt(pairings.expiresAt, now));
	await db.delete(sessions).where(lt(sessions.expiresAt, now));
}
