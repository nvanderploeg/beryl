import { randomBytes, randomInt } from 'node:crypto';
import { and, eq, gt, isNull, lt } from 'drizzle-orm';
import { ApiError } from '#lib/server/api.ts';
import { db } from '#lib/server/db/index.ts';
import { deviceCodes } from '#lib/server/db/schema.ts';
import { hashKey } from '#lib/server/hash.ts';

export const DEVICE_TTL_MS = 10 * 60_000;
export const DEVICE_INTERVAL_S = 3;
const DEVICE_PREFIX = 'bd_';
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

export type Exchange = { pending: true } | { uid: string };

// Approval is consumed by the first redemption, which hands the uid back for a custom token.
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
	return { uid: row.uid };
}

export async function pruneDeviceCodes(now = new Date()): Promise<void> {
	await db.delete(deviceCodes).where(lt(deviceCodes.expiresAt, now));
}
