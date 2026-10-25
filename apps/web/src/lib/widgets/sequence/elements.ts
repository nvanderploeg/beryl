import type { SequenceData } from '../types.ts';

export function elements(data: SequenceData): { key: string; label: string }[] {
	const names = new Map(data.actors.map((a) => [a.key, a.label]));
	const out = data.actors.map((a) => ({ key: a.key, label: a.label }));
	for (const s of data.steps) {
		const from = names.get(s.from) ?? s.from;
		const to = names.get(s.to) ?? s.to;
		const label =
			s.kind === 'note'
				? `note over ${from === to ? from : `${from}–${to}`}: ${s.label}`
				: `${from} → ${to}: ${s.label}`;
		out.push({ key: s.key, label });
	}
	return out;
}
