import type { StatesData } from '../types.ts';

export function transitionKey(t: StatesData['transitions'][number]): string {
	return t.key ?? `${t.from}->${t.to}`;
}

export function elements(data: StatesData): { key: string; label: string }[] {
	const names = new Map(data.states.map((s) => [s.key, s.label]));
	const out = data.states.map((s) => ({ key: s.key, label: s.label }));
	for (const t of data.transitions) {
		const from = names.get(t.from) ?? t.from;
		const to = names.get(t.to) ?? t.to;
		out.push({ key: transitionKey(t), label: `${from} → ${to}${t.label ? `: ${t.label}` : ''}` });
	}
	return out;
}
