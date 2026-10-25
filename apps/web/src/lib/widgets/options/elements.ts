import type { OptionsData } from '../types.ts';

export function elements(data: OptionsData): { key: string; label: string }[] {
	const out: { key: string; label: string }[] = [];
	for (const c of data.criteria ?? [])
		for (const o of data.options)
			out.push({ key: `${o.key}.${c.key}`, label: `${o.title} · ${c.label}` });
	for (const o of data.options) out.push({ key: o.key, label: o.title });
	return out;
}
