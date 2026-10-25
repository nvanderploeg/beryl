import { describe, expect, it } from 'vitest';
import demo from '#lib/fixtures/demo-grill.json' with { type: 'json' };
import type { DemoFixture } from '#lib/fixtures/types.ts';
import type { Widget } from '#lib/types.ts';
import { elementsOf } from '../elements.ts';
import type { SchemaData } from '../types.ts';
import { elements } from './elements.ts';
import { buildModel, cardTop, HEAD_H, ROW_H, routeFk, shownChange, stack } from './model.ts';

function fixtureWidget(path: string, key: string, turn: number): Widget {
	const found = (demo as DemoFixture).turns[turn - 1].nodes
		?.find((n) => n.path === path)
		?.widgets?.find((w) => w.key === key);
	if (!found) throw new Error(`no widget ${path} ${key} in turn ${turn}`);
	return found;
}

describe('schema elements', () => {
	it('lists each table, then its columns, then its indexes, in data order', () => {
		const keys = elementsOf(fixtureWidget('data/current', 'current', 1)).map((e) => e.key);
		expect(keys).toEqual([
			'users',
			'users.id',
			'users.username',
			'users.email',
			'users.is_bot',
			'realms',
			'realms.id',
			'realms.key',
			'realms.owner_id',
			'realms.name',
			'labours',
			'labours.id',
			'labours.realm_id',
			'labours.parent_id',
			'labours.title',
			'labours#labours_realm_idx'
		]);
	});

	it('has the Elements the fixture notes pin to', () => {
		const current = elementsOf(fixtureWidget('data/current', 'current', 1)).map((e) => e.key);
		expect(current).toContain('labours.parent_id');
		const proposed = elementsOf(fixtureWidget('data/schema', 'tables', 2)).map((e) => e.key);
		expect(proposed).toContain('memberships.role');
		expect(proposed).toContain('realms#realms_workspace_idx');
		expect(new Set(proposed).size).toBe(proposed.length);
	});

	it('labels columns table.column and indexes by name and table', () => {
		const data: SchemaData = {
			tables: [
				{
					name: 'users',
					change: 'renamed',
					from: 'people',
					columns: [{ name: 'email', type: 'text' }],
					indexes: [{ name: 'users_email', columns: ['email'], unique: true }]
				}
			]
		};
		expect(elements(data)).toEqual([
			{ key: 'users', label: 'users' },
			{ key: 'users.email', label: 'users.email' },
			{ key: 'users#users_email', label: 'index users_email on users' }
		]);
	});
});

describe('schema model', () => {
	const data: SchemaData = {
		tables: [
			{
				name: 'labours',
				columns: [
					{ name: 'id', type: 'bigint', pk: true },
					{ name: 'parent_id', type: 'bigint', references: { table: 'labours', column: 'id' } },
					{ name: 'realm_id', type: 'bigint', references: { table: 'realms', column: 'id' } },
					{ name: 'owner', type: 'bigint', references: { table: 'users', column: 'id' } },
					{ name: 'editor', type: 'bigint', references: { table: 'users', column: 'id' } },
					{ name: 'sku', type: 'text', references: { table: 'users', column: 'sku' } }
				]
			},
			{ name: 'realms', columns: [{ name: 'id', type: 'bigint', pk: true }] }
		]
	};

	it('draws a reference to a table outside the widget to one stub per table', () => {
		const model = buildModel(data);
		const stubs = model.cards.filter((c) => !c.table);
		expect(stubs.map((c) => [c.name, c.rows.map((r) => r.name)])).toEqual([
			['users', ['id', 'sku']]
		]);
		const owner = model.fks.find((f) => f.element === 'labours.owner');
		expect(owner?.to).toEqual({ card: stubs[0].id, row: 0 });
		expect(model.fks.find((f) => f.element === 'labours.sku')?.to.row).toBe(1);
	});

	it('anchors each FK at its column row and the referenced row', () => {
		const model = buildModel(data);
		const self = model.fks.find((f) => f.element === 'labours.parent_id');
		expect(self?.from).toEqual({ card: self?.to.card, row: 1 });
		expect(self?.to.row).toBe(0);
		expect(model.fks.find((f) => f.element === 'labours.realm_id')?.to.row).toBe(0);
	});

	it('points a reference to a missing column at the card header', () => {
		const model = buildModel({
			tables: [
				{
					name: 'a',
					columns: [{ name: 'b_id', type: 'int', references: { table: 'b', column: 'nope' } }]
				},
				{ name: 'b', columns: [{ name: 'id', type: 'int' }] }
			]
		});
		expect(model.fks[0].to.row).toBe(-1);
	});

	it('sizes cards so wider content gets a wider card, within bounds', () => {
		const [narrow, wide] = buildModel({
			tables: [
				{ name: 'a', columns: [{ name: 'id', type: 'int' }] },
				{ name: 'b', columns: [{ name: 'a_rather_long_column_name', type: 'varchar(255)' }] }
			]
		}).cards;
		expect(narrow.width).toBeGreaterThanOrEqual(150);
		expect(wide.width).toBeGreaterThan(narrow.width);
		expect(wide.width).toBeLessThanOrEqual(340);
		expect(narrow.height).toBe(cardTop(narrow) + ROW_H + 1);
	});

	it('leaves column markers off a column added with its table', () => {
		const table = {
			name: 't',
			change: 'added' as const,
			columns: [
				{ name: 'a', type: 'int', change: 'added' as const },
				{ name: 'b', type: 'int', change: 'changed' as const }
			]
		};
		expect(shownChange(table, table.columns[0])).toBeUndefined();
		expect(shownChange(table, table.columns[1])).toBe('changed');
		expect(buildModel({ tables: [table] }).cards[0].changes).toBe(true);
	});

	it('routes between facing sides, and loops right for overlapping cards', () => {
		const [card] = buildModel(data).cards;
		const left = { x: 0, y: 0, width: 100, height: 200 };
		const right = { x: 200, y: 0, width: 100, height: 200 };
		const across = routeFk(left, card, 0, right, card, 0);
		expect(across.d.startsWith(`M100,${1 + HEAD_H + ROW_H / 2}`)).toBe(true);
		expect(across.d.endsWith(`200,${1 + HEAD_H + ROW_H / 2}`)).toBe(true);
		const back = routeFk(right, card, 0, left, card, 0);
		expect(back.d.startsWith('M200,')).toBe(true);
		const loop = routeFk(left, card, 1, left, card, 0);
		expect(loop.d.startsWith('M100,')).toBe(true);
		expect(loop.right).toBeGreaterThan(100);
	});

	it('stacks cards in one column in the given order', () => {
		const model = buildModel(data);
		const order = (id: string) => (id.startsWith('s:') ? 0 : id === 't:realms' ? 1 : 2);
		const { boxes, height } = stack(model.cards, order);
		const ys = model.cards.map((c) => [c.name, boxes[c.id].y] as const).sort((a, b) => a[1] - b[1]);
		expect(ys.map(([name]) => name)).toEqual(['users', 'realms', 'labours']);
		expect(new Set(Object.values(boxes).map((b) => b.x)).size).toBe(1);
		expect(height).toBeGreaterThan(model.cards.reduce((sum, c) => sum + c.height, 0));
	});
});
