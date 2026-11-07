import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { and, desc, eq, gt, isNull, lt } from 'drizzle-orm';
import { ApiError } from '#lib/server/api.ts';
import { db } from '#lib/server/db/index.ts';
import { deviceCodes, loginTokens } from '#lib/server/db/schema.ts';
import { hashKey } from '#lib/server/hash.ts';

export const DEVICE_TTL_MS = 10 * 60_000;
export const DEVICE_INTERVAL_S = 3;
export const LOGIN_PREFIX = 'bl_';
const DEVICE_PREFIX = 'bd_';
const USED_REFRESH_MS = 60_000;
// No vowels or look-alikes, so a code read aloud or typed from a terminal survives.
const USER_CODE_ALPHABET = 'BCDFGHJKLMNPQRSTVWXZ23456789';

const secret = (prefix: string) => `${prefix}${randomBytes(32).toString('base64url')}`;

function newUserCode(): string {
	const pick = () => USER_CODE_ALPHABET[randomInt(USER_CODE_ALPHABET.length)];
	const half = () => Array.from({ length: 4 }, pick).join('');
	return `${half()}-${half()}`;
}

export const normalizeUserCode = (raw: string) =>
	raw
		.toUpperCase()
		.replace(/[^A-Z0-9]/g, '')
		.replace(/^(.{4})(.{4})$/, '$1-$2');

export async function createDeviceCode(
	label: string,
	now = new Date()
): Promise<{ deviceCode: string; userCode: string; expiresAt: Date }> {
	const deviceCode = secret(DEVICE_PREFIX);
	const expiresAt = new Date(now.getTime() + DEVICE_TTL_MS);
	for (let attempt = 1; ; attempt++) {
		const userCode = newUserCode();
		try {
			await db
				.insert(deviceCodes)
				.values({ codeHash: hashKey(deviceCode), userCode, label, expiresAt });
			await pruneDeviceCodes(now);
			return { deviceCode, userCode, expiresAt };
		} catch (error) {
			if (attempt >= 5) throw error;
		}
	}
}

export async function peekDeviceCode(
	userCode: string,
	now = new Date()
): Promise<{ label: string } | undefined> {
	const [row] = await db
		.select({ label: deviceCodes.label })
		.from(deviceCodes)
		.where(
			and(
				eq(deviceCodes.userCode, normalizeUserCode(userCode)),
				isNull(deviceCodes.uid),
				gt(deviceCodes.expiresAt, now)
			)
		);
	return row;
}

// The conditional update is the claim: a code approves once, for the first person to do it.
export async function approveDeviceCode(
	userCode: string,
	uid: string,
	now = new Date()
): Promise<{ label: string }> {
	const [row] = await db
		.update(deviceCodes)
		.set({ uid })
		.where(
			and(
				eq(deviceCodes.userCode, normalizeUserCode(userCode)),
				isNull(deviceCodes.uid),
				gt(deviceCodes.expiresAt, now)
			)
		)
		.returning({ label: deviceCodes.label });
	if (!row) throw new ApiError(404, 'unknown or expired code');
	return row;
}

export type Exchange = { pending: true } | { token: string; uid: string };

export async function exchangeDeviceCode(deviceCode: string, now = new Date()): Promise<Exchange> {
	const codeHash = hashKey(deviceCode);
	const [row] = await db.select().from(deviceCodes).where(eq(deviceCodes.codeHash, codeHash));
	if (!row || row.expiresAt <= now) throw new ApiError(410, 'code expired');
	if (row.uid === null) return { pending: true };
	const claimed = await db
		.delete(deviceCodes)
		.where(eq(deviceCodes.codeHash, codeHash))
		.returning({ codeHash: deviceCodes.codeHash });
	if (claimed.length !== 1) throw new ApiError(410, 'code expired');
	const token = secret(LOGIN_PREFIX);
	await db.insert(loginTokens).values({
		id: randomUUID(),
		tokenHash: hashKey(token),
		uid: row.uid,
		label: row.label,
		createdAt: now
	});
	return { token, uid: row.uid };
}

export async function uidOfLoginToken(token: string, now = new Date()): Promise<string | null> {
	const tokenHash = hashKey(token);
	const [row] = await db.select().from(loginTokens).where(eq(loginTokens.tokenHash, tokenHash));
	if (!row) return null;
	if (!row.lastUsedAt || now.getTime() - row.lastUsedAt.getTime() > USED_REFRESH_MS) {
		await db.update(loginTokens).set({ lastUsedAt: now }).where(eq(loginTokens.id, row.id));
	}
	return row.uid;
}

export async function listLoginTokens(uid: string) {
	const rows = await db
		.select()
		.from(loginTokens)
		.where(eq(loginTokens.uid, uid))
		.orderBy(desc(loginTokens.createdAt), loginTokens.id);
	return rows.map((row) => ({
		id: row.id,
		label: row.label,
		createdAt: row.createdAt.toISOString(),
		lastUsedAt: row.lastUsedAt?.toISOString() ?? null
	}));
}

export async function revokeLoginToken(uid: string, id: string): Promise<void> {
	const removed = await db
		.delete(loginTokens)
		.where(and(eq(loginTokens.id, id), eq(loginTokens.uid, uid)))
		.returning({ id: loginTokens.id });
	if (removed.length !== 1) throw new ApiError(404, 'token not found');
}

export async function pruneDeviceCodes(now = new Date()): Promise<void> {
	await db.delete(deviceCodes).where(lt(deviceCodes.expiresAt, now));
}
