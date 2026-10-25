import { describe, expect, it } from 'vitest';
import demo from '#lib/fixtures/demo-grill.json' with { type: 'json' };
import type { DemoFixture } from '#lib/fixtures/types.ts';
import type { Widget } from '#lib/types.ts';
import { elementsOf } from '../elements.ts';
import { cellKind, cellText } from '../shared/cells.ts';
import { addCounts, countChanges, totalChanges } from '../shared/counts.ts';
import { elements } from './elements.ts';

function fixtureWidget(path: string, key: string): Widget {
	const found = (demo as DemoFixture).turns
		.flatMap((t) => t.nodes ?? [])
		.filter((n) => n.path === path)
		.flatMap((n) => n.widgets ?? [])
		.findLast((w) => w.key === key);
	if (!found) throw new Error(`no widget ${path} ${key}`);
	return found;
}

describe('table elements', () => {
	it('lists row keys in order, labelled by their first cell', () => {
		expect(elementsOf(fixtureWidget('permissions/roles', 'matrix'))).toEqual([
			{ key: 'read', label: 'Read realms' },
			{ key: 'write', label: 'Edit labours' },
			{ key: 'members', label: 'Manage members' },
			{ key: 'billing', label: 'Billing' },
			{ key: 'delete', label: 'Delete workspace' }
		]);
	});

	it('falls back to the row key when the first cell is not text', () => {
		expect(
			elements({
				columns: ['id', 'name'],
				rows: [
					{ key: 'r1', cells: [1, 'one'] },
					{ key: 'r2', cells: ['  ', 'blank'] },
					{ key: 'r3', cells: ['two\nlines', 'x'] }
				]
			})
		).toEqual([
			{ key: 'r1', label: 'r1' },
			{ key: 'r2', label: 'r2' },
			{ key: 'r3', label: 'two lines' }
		]);
	});
});

describe('cells', () => {
	it('shows booleans as ✓ and –, and null as a dash', () => {
		expect(cellText(true)).toBe('✓');
		expect(cellText(false)).toBe('–');
		expect(cellText(null)).toBe('—');
		expect(cellText(null, 'null')).toBe('null');
		expect(cellText(0)).toBe('0');
		expect(cellText('')).toBe('');
		expect([null, true, false, 3, 'x'].map(cellKind)).toEqual([
			'null',
			'true',
			'false',
			'number',
			'text'
		]);
	});
});

describe('change counts', () => {
	it('counts each change and ignores kept and unchanged items', () => {
		const counts = countChanges([
			{ change: 'added' },
			{ change: 'added' },
			{ change: 'kept' },
			{},
			{ change: 'renamed' }
		]);
		expect(counts).toEqual({ added: 2, removed: 0, changed: 0, renamed: 1 });
		expect(totalChanges(addCounts(counts, countChanges([{ change: 'removed' }])))).toBe(4);
	});
});
