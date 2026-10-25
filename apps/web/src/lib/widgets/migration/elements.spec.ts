import { describe, expect, it } from 'vitest';
import demo from '#lib/fixtures/demo-grill.json' with { type: 'json' };
import type { DemoFixture } from '#lib/fixtures/types.ts';
import type { Widget } from '#lib/types.ts';
import { elementsOf } from '../elements.ts';
import type { MigrationData } from '../types.ts';
import { elements } from './elements.ts';

function fixtureWidget(path: string, key: string, turn: number): Widget {
	const found = (demo as DemoFixture).turns[turn - 1].nodes
		?.find((n) => n.path === path)
		?.widgets?.find((w) => w.key === key);
	if (!found) throw new Error(`no widget ${path} ${key} in turn ${turn}`);
	return found;
}

describe('migration elements', () => {
	it('lists each step, then its columns, then its rows', () => {
		const keys = elementsOf(fixtureWidget('migration/plan', 'plan', 3)).map((e) => e.key);
		expect(keys).toEqual([
			'create-workspaces',
			'create-workspaces.id',
			'create-workspaces.slug',
			'create-workspaces.name',
			'create-workspaces.personal',
			'backfill-workspaces',
			'backfill-workspaces#u-1',
			'backfill-workspaces#u-2',
			'backfill-workspaces#u-17',
			'alter-realms',
			'alter-realms.workspace_id',
			'alter-realms.owner_id',
			'detach-parents',
			'detach-parents#l-204',
			'detach-parents#l-311',
			'detach-parents#l-512',
			'seed-memberships',
			'seed-memberships#m-1',
			'seed-memberships#m-2',
			'seed-memberships#m-17'
		]);
	});

	it('keeps the row the fixture note pins to in both versions of the plan', () => {
		for (const turn of [3, 4]) {
			const keys = elementsOf(fixtureWidget('migration/plan', 'plan', turn)).map((e) => e.key);
			expect(keys).toContain('backfill-workspaces#u-17');
		}
	});

	it('labels steps by op and table, and parts under their step', () => {
		const data: MigrationData = {
			steps: [
				{ key: 'r', op: 'rename', table: 'bills', to: 'invoices' },
				{
					key: 'b',
					op: 'backfill',
					table: 'invoices',
					columns: [{ name: 'total', change: 'added', after: 'int' }],
					rows: { columns: ['id'], items: [{ key: 'i-1', change: 'added', values: [1] }] }
				}
			]
		};
		expect(elements(data)).toEqual([
			{ key: 'r', label: 'rename bills → invoices' },
			{ key: 'b', label: 'backfill invoices' },
			{ key: 'b.total', label: 'backfill invoices › total' },
			{ key: 'b#i-1', label: 'backfill invoices › row i-1' }
		]);
	});
});
