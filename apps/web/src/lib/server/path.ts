// The path as the router sees it: percent-decoding applied until stable, case folded, slashes
// collapsed, trailing slash dropped. Null for a malformed encoding.
export function normalizePath(pathname: string): string | null {
	let path = pathname;
	for (let i = 0; i < 8; i++) {
		let next: string;
		try {
			next = decodeURIComponent(path);
		} catch {
			return null;
		}
		if (next === path) break;
		path = next;
	}
	path = path.toLowerCase().replace(/\/{2,}/g, '/');
	return path.length > 1 ? path.replace(/\/$/, '') : path;
}
