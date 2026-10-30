import { goto } from '$app/navigation';
import { keys, readStored, writeStored } from './storage.ts';

const PATTERN = /(?:^#|&)pc=([^&]+)/;

// Under the server's session TTL, so a visible tab renews before it lapses.
export const HEARTBEAT_MS = 4 * 60_000;

export type Renewal = 'ok' | 'lapsed' | 'unreachable';

// Drops the code from the URL before anything else can copy it.
export function takePairingCode(): string | null {
	const match = PATTERN.exec(location.hash);
	if (!match) return null;
	const url = new URL(location.href);
	url.hash = '';
	// eslint-disable-next-line svelte/no-navigation-without-resolve -- same page, hash dropped
	void goto(url, { replace: true, shallow: true, state: {} });
	return decodeURIComponent(match[1]);
}

// Storage may be blocked, so a token also lives in memory for client-side navigation.
const held = new Map<string, string>();

export const storedToken = (projectId: string) =>
	readStored(keys.session(projectId)) ?? held.get(projectId) ?? null;

export function storeToken(projectId: string, token: string | null): void {
	if (token === null) held.delete(projectId);
	else held.set(projectId, token);
	writeStored(keys.session(projectId), token);
}

export type Redeemed = { token: string } | 'refused' | 'unreachable';

// 'refused' means the server judged the code (unknown, used or expired); anything else is retryable.
export async function redeemCode(code: string): Promise<Redeemed> {
	try {
		const res = await fetch('/api/pairings/redeem', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ code })
		});
		if (res.ok) return { token: ((await res.json()) as { token: string }).token };
		return res.status === 400 || res.status === 403 ? 'refused' : 'unreachable';
	} catch {
		return 'unreachable';
	}
}

export async function renewToken(token: string): Promise<Renewal> {
	try {
		const res = await fetch('/api/session', {
			method: 'POST',
			headers: { authorization: `Bearer ${token}` }
		});
		if (res.ok) return 'ok';
		return res.status === 401 || res.status === 403 ? 'lapsed' : 'unreachable';
	} catch {
		return 'unreachable';
	}
}
