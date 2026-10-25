import { goto } from '$app/navigation';
import { keys, readStored, writeStored } from './storage.ts';

const PATTERN = /(?:^#|&)nk=([^&]+)/;

// Idempotent: the first call moves the key from the hash to storage.
export function captureNoteKey(projectId: string): string | null {
	const match = PATTERN.exec(location.hash);
	if (match) {
		writeStored(keys.noteKey(projectId), decodeURIComponent(match[1]));
		const url = new URL(location.href);
		url.hash = '';
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- same page, hash dropped
		void goto(url, { replace: true, shallow: true, state: {} });
	}
	return readStored(keys.noteKey(projectId));
}
