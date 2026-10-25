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
	noteKey: (projectId: string) => `speculum:nk:${projectId}`,
	seen: (topicId: string) => `speculum:seen:${topicId}`,
	sidebar: 'speculum:sidebar',
	include: 'speculum:include',
	author: 'speculum:author',
	theme: 'speculum:theme'
};
