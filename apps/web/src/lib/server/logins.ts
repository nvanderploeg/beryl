import { randomBytes, randomInt } from 'node:crypto';
import { and, eq, gt, isNull, lt } from 'drizzle-orm';
import { ApiError } from '#lib/server/api.ts';
import { db } from '#lib/server/db/index.ts';
import { deviceCodes } from '#lib/server/db/schema.ts';
import { hashKey } from '#lib/server/hash.ts';
import { createRateLimiter } from '#lib/server/ratelimit.ts';

export const DEVICE_TTL_MS = 10 * 60_000;
export const DEVICE_INTERVAL_S = 3;
const DEVICE_PREFIX = 'bd_';
// No vowels or look-alikes, so a code read aloud or typed from a terminal survives.
const USER_CODE_ALPHABET = 'BCDFGHJKLMNPQRSTVWXZ23456789';

const lookups = createRateLimiter(10, 60_000);
const approvals = createRateLimiter(10, 60_000);
const polls = createRateLimiter(30, 60_000);

export function resetDeviceLimits(): void {
	for (const limiter of [lookups, approvals, polls]) limiter.clear();
}

function limited(limiter: ReturnType<typeof createRateLimiter>, key: string): void {
	const verdict = limiter.take(key);
	if (verdict.ok) return;
	const seconds = String(Math.ceil(verdict.retryAfterMs / 1000));
	throw new ApiError(429, 'too many attempts; retry later', {}, { 'retry-after': seconds });
}

export const limitLookup = (ip: string) => limited(lookups, ip);
export const limitApproval = (ip: string) => limited(approvals, ip);
export const limitPoll = (deviceCode: string) => limited(polls, hashKey(deviceCode));

export interface DeviceRequester {
	ip: string;
	userAgent: string;
}

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
	requester: DeviceRequester,
	now = new Date()
): Promise<{ deviceCode: string; userCode: string; expiresAt: Date }> {
	const deviceCode = secret(DEVICE_PREFIX);
	const expiresAt = new Date(now.getTime() + DEVICE_TTL_MS);
	for (let attempt = 1; ; attempt++) {
		const userCode = newUserCode();
		try {
			await db
				.insert(deviceCodes)
				.values({
					codeHash: hashKey(deviceCode),
					userCode,
					label,
					requestIp: requester.ip.slice(0, 64),
					requestAgent: requester.userAgent.slice(0, 200),
					expiresAt
				});
			await pruneDeviceCodes(now);
			return { deviceCode, userCode, expiresAt };
		} catch (error) {
			if (attempt >= 5) throw error;
		}
	}
}

export interface PendingDevice {
	label: string;
	ip: string | null;
	userAgent: string | null;
	startedAt: Date;
}

export async function peekDeviceCode(
	userCode: string,
	now = new Date()
): Promise<PendingDevice | undefined> {
	const [row] = await db
		.select({
			label: deviceCodes.label,
			ip: deviceCodes.requestIp,
			userAgent: deviceCodes.requestAgent,
			startedAt: deviceCodes.createdAt
		})
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

export type Exchange<T> = { pending: true } | { uid: string; minted: T };

// Approval is consumed by the first redemption. `mint` runs before the row is claimed, so a
// failure leaves the approval in place for the next poll.
export async function exchangeDeviceCode<T>(
	deviceCode: string,
	mint: (uid: string) => Promise<T>,
	now = new Date()
): Promise<Exchange<T>> {
	const codeHash = hashKey(deviceCode);
	const [row] = await db.select().from(deviceCodes).where(eq(deviceCodes.codeHash, codeHash));
	if (!row || row.expiresAt <= now) throw new ApiError(410, 'code expired');
	if (row.uid === null) return { pending: true };
	const minted = await mint(row.uid);
	const claimed = await db
		.delete(deviceCodes)
		.where(eq(deviceCodes.codeHash, codeHash))
		.returning({ codeHash: deviceCodes.codeHash });
	if (claimed.length !== 1) throw new ApiError(410, 'code expired');
	return { uid: row.uid, minted };
}

export async function pruneDeviceCodes(now = new Date()): Promise<void> {
	await db.delete(deviceCodes).where(lt(deviceCodes.expiresAt, now));
}
