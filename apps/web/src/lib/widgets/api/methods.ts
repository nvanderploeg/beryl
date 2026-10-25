const colors: Record<string, string> = {
	GET: 'var(--settled)',
	POST: 'var(--accent)',
	PUT: 'var(--fog)',
	PATCH: 'color-mix(in srgb, var(--fog) 55%, var(--settled))',
	DELETE: 'var(--removed)'
};

export function methodColor(method: string): string {
	return colors[method.toUpperCase()] ?? 'var(--parked)';
}

export function isTool(method: string): boolean {
	return method.toUpperCase() === 'TOOL';
}

export function pathParts(path: string): { text: string; param: boolean }[] {
	return path
		.split(/(:[A-Za-z_][\w-]*|\{[^}]+\})/)
		.filter(Boolean)
		.map((text) => ({ text, param: /^(:|\{)/.test(text) }));
}
