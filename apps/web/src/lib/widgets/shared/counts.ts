import type { Change } from '../types.ts';

export type ChangeCounts = Record<Change, number>;

export function countChanges(items: { change?: Change | 'kept' }[]): ChangeCounts {
	const counts: ChangeCounts = { added: 0, removed: 0, changed: 0, renamed: 0 };
	for (const item of items) {
		if (item.change && item.change !== 'kept') counts[item.change] += 1;
	}
	return counts;
}

export function addCounts(a: ChangeCounts, b: ChangeCounts): ChangeCounts {
	return {
		added: a.added + b.added,
		removed: a.removed + b.removed,
		changed: a.changed + b.changed,
		renamed: a.renamed + b.renamed
	};
}

export function totalChanges(counts: ChangeCounts): number {
	return counts.added + counts.removed + counts.changed + counts.renamed;
}
