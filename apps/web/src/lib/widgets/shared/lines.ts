export function splitLines(code: string): string[] {
	const text = code.replace(/\r\n?/g, '\n');
	return (text.endsWith('\n') ? text.slice(0, -1) : text).split('\n');
}
