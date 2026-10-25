import type { Node, Note } from '../types.ts';

export function indexByPath(nodes: Node[]): Map<string, Node> {
	return new Map(nodes.map((n) => [n.path, n]));
}

export function parentPaths(nodes: Node[]): Set<string> {
	return new Set(nodes.map((n) => n.parentPath).filter((p): p is string => p !== null));
}

// Unresolved Notes per anchored Path, widget and element notes included.
export function openNoteCounts(notes: Note[]): Map<string, number> {
	const counts = new Map<string, number>();
	for (const n of notes) {
		if (n.status === 'resolved' || n.anchor.path === null) continue;
		counts.set(n.anchor.path, (counts.get(n.anchor.path) ?? 0) + 1);
	}
	return counts;
}

export function without<T>(set: Set<T>, drop: Iterable<T>): Set<T> {
	const out = new Set(set);
	for (const item of drop) out.delete(item);
	return out;
}
