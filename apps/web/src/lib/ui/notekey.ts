import { goto } from '$app/navigation';
import { keys, readStored, writeStored } from './storage.ts';

const PATTERN = /(?:^#|&)nk=([^&]+)/;

// Storage may be blocked, so a key taken from the hash also lives in memory for this page.
const held = new Map<string, string>();

export function captureNoteKey(projectId: string): string | null {
	const match = PATTERN.exec(location.hash);
	if (match) {
		const key = decodeURIComponent(match[1]);
		held.set(projectId, key);
		writeStored(keys.noteKey(projectId), key);
		const url = new URL(location.href);
		url.hash = '';
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- same page, hash dropped
		void goto(url, { replace: true, shallow: true, state: {} });
		return key;
	}
	return readStored(keys.noteKey(projectId)) ?? held.get(projectId) ?? null;
}
