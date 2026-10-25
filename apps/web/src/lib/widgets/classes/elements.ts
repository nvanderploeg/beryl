import type { ClassesData, ClassRelation } from '../types.ts';

export function relationKeys(relations: ClassRelation[]): string[] {
	const pairs = new Map<string, number>();
	for (const r of relations) {
		const pair = `${r.from}->${r.to}`;
		pairs.set(pair, (pairs.get(pair) ?? 0) + 1);
	}
	return relations.map((r) => {
		const pair = `${r.from}->${r.to}`;
		return (pairs.get(pair) ?? 0) > 1 ? `${pair}:${r.kind}` : pair;
	});
}

export function elements(data: ClassesData): { key: string; label: string }[] {
	const out: { key: string; label: string }[] = [];
	const names = new Map<string, string>();
	for (const c of data.classes) {
		names.set(c.key, c.name);
		out.push({ key: c.key, label: c.name });
		for (const f of c.fields ?? [])
			out.push({ key: `${c.key}.${f.name}`, label: `${c.name}.${f.name}` });
		for (const m of c.methods ?? [])
			out.push({ key: `${c.key}.${m.name}()`, label: `${c.name}.${m.name}()` });
	}
	const relations = data.relations ?? [];
	const keys = relationKeys(relations);
	relations.forEach((r, i) => {
		const from = names.get(r.from) ?? r.from;
		const to = names.get(r.to) ?? r.to;
		out.push({ key: keys[i], label: `${from} ${r.kind} ${to}` });
	});
	return out;
}
