import { describe, expect, it } from 'vitest';
import {
	DOCKS,
	GROUP_MIN_WEIGHT,
	PANELS,
	ZONE_MIN,
	defaultLayout,
	locate,
	moveToTabs,
	moveToZone,
	narrowLayout,
	parseLayout,
	reveal,
	setCollapsed,
	setZoneSize,
	shiftDivider,
	type Layout
} from './layout.ts';

function placed(layout: Layout): string[] {
	return DOCKS.flatMap((d) => layout[d].groups.flatMap((g) => g.panels)).sort();
}

const ALL = PANELS.map((p) => p.id).sort();

describe('layout', () => {
	it('places every panel exactly once in the default and narrow layouts', () => {
		expect(placed(defaultLayout())).toEqual(ALL);
		expect(placed(narrowLayout())).toEqual(ALL);
	});

	it('tabs a panel into another group and drops the group it left', () => {
		const next = moveToTabs(defaultLayout(), 'notes', 'g1');
		expect(placed(next)).toEqual(ALL);
		expect(next.left.groups[0].panels).toEqual(['questions', 'notes']);
		expect(next.left.groups[0].active).toBe('notes');
		expect(next.right.groups.map((g) => g.id)).toEqual(['g2']);
	});

	it('keeps the remaining tab active when the active one leaves', () => {
		const next = moveToZone(defaultLayout(), 'details', 'bottom');
		const rest = next.right.groups[0];
		expect(rest.panels).toEqual(['history']);
		expect(rest.active).toBe('history');
	});

	it('orders tabs by the panel they are dropped before', () => {
		const next = moveToTabs(defaultLayout(), 'history', 'g3', 'notes');
		expect(next.right.groups.find((g) => g.id === 'g3')!.panels).toEqual(['history', 'notes']);
	});

	it('splits a panel into a new group before a sibling or at the end', () => {
		const before = moveToZone(defaultLayout(), 'questions', 'right', 'g3');
		expect(before.left.groups).toEqual([]);
		expect(before.right.groups.map((g) => g.panels[0])).toEqual(['details', 'questions', 'notes']);
		const end = moveToZone(defaultLayout(), 'questions', 'right');
		expect(end.right.groups.map((g) => g.panels[0])).toEqual(['details', 'notes', 'questions']);
	});

	it('reopens a collapsed zone that receives a panel', () => {
		const closed = setCollapsed(defaultLayout(), 'bottom', true);
		expect(moveToZone(closed, 'history', 'bottom').bottom.collapsed).toBe(false);
	});

	it('leaves the layout untouched when a lone panel is dropped where it already is', () => {
		const layout = defaultLayout();
		expect(moveToTabs(layout, 'questions', 'g1')).toBe(layout);
		expect(moveToZone(layout, 'questions', 'left')).toBe(layout);
		expect(moveToZone(layout, 'notes', 'right')).toBe(layout);
	});

	it('never mutates its input', () => {
		const layout = defaultLayout();
		const frozen = JSON.stringify(layout);
		moveToTabs(layout, 'notes', 'g1');
		moveToZone(layout, 'details', 'bottom');
		shiftDivider(layout, 'right', 0, 0.5);
		reveal(layout, 'history');
		setZoneSize(layout, 'left', 500);
		expect(JSON.stringify(layout)).toBe(frozen);
	});

	it('reveals a panel by activating its tab and opening its zone', () => {
		const closed = setCollapsed(defaultLayout(), 'right', true);
		const next = reveal(closed, 'history');
		expect(next.right.collapsed).toBe(false);
		expect(locate(next, 'history')!.group.active).toBe('history');
	});

	it('clamps zone size to its minimum', () => {
		expect(setZoneSize(defaultLayout(), 'left', 10).left.size).toBe(ZONE_MIN.left);
	});

	it('shifts a divider while conserving weight and keeping both sides above the minimum', () => {
		const layout = defaultLayout();
		const total = layout.right.groups.reduce((s, g) => s + g.weight, 0);
		const moved = shiftDivider(layout, 'right', 0, 100);
		expect(moved.right.groups.reduce((s, g) => s + g.weight, 0)).toBeCloseTo(total);
		expect(moved.right.groups[1].weight).toBeCloseTo(GROUP_MIN_WEIGHT);
		const other = shiftDivider(layout, 'right', 0, -100);
		expect(other.right.groups[0].weight).toBeCloseTo(GROUP_MIN_WEIGHT);
		expect(shiftDivider(layout, 'right', 1, 1)).toBe(layout);
	});
});

describe('parseLayout', () => {
	it('round-trips a layout', () => {
		const layout = moveToZone(defaultLayout(), 'history', 'bottom');
		expect(parseLayout(JSON.stringify(layout))).toEqual(layout);
	});

	it.each([
		['nothing stored', null],
		['not json', '{'],
		[
			'a panel missing',
			JSON.stringify({ ...defaultLayout(), left: { ...defaultLayout().left, groups: [] } })
		],
		[
			'a panel twice',
			JSON.stringify(moveToTabs(defaultLayout(), 'notes', 'g1')).replace('"history"', '"notes"')
		],
		['an unknown panel', JSON.stringify(defaultLayout()).replace('"history"', '"bogus"')],
		['a non-numeric size', JSON.stringify(defaultLayout()).replace('"size":300', '"size":"x"')]
	])('falls back to the default for %s', (_, raw) => {
		expect(parseLayout(raw)).toEqual(defaultLayout());
	});

	it('repairs an active tab that is not in its group', () => {
		const layout = defaultLayout();
		layout.right.groups[0].active = 'questions';
		expect(parseLayout(JSON.stringify(layout)).right.groups[0].active).toBe('details');
	});
});
