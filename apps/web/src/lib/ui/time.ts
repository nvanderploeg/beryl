const UNITS: [number, string][] = [
	[60, 's'],
	[60, 'm'],
	[24, 'h'],
	[7, 'd'],
	[4.35, 'w'],
	[12, 'mo']
];

export function ago(iso: string, now: number = Date.now()): string {
	let value = Math.max(0, (now - Date.parse(iso)) / 1000);
	if (value < 45) return 'just now';
	for (const [step, unit] of UNITS) {
		if (value < step) return `${Math.round(value)}${unit} ago`;
		value /= step;
	}
	return `${Math.round(value)}y ago`;
}

export function clock(iso: string): string {
	const d = new Date(iso);
	return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function stamp(iso: string): string {
	const d = new Date(iso);
	return d.toLocaleString([], {
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit'
	});
}
