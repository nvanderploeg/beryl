// Swallow every storage error: private windows and full quotas must not break the board.

export function readStored(key: string): string | null {
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}

export function writeStored(key: string, value: string | null): void {
	try {
		if (value === null) localStorage.removeItem(key);
		else localStorage.setItem(key, value);
	} catch {
		// not remembered
	}
}

export const keys = {
	noteKey: (projectId: string) => `beryl:nk:${projectId}`,
	seen: (topicId: string) => `beryl:seen:${topicId}`,
	sidebar: 'beryl:sidebar',
	include: 'beryl:include',
	author: 'beryl:author',
	theme: 'beryl:theme'
};
