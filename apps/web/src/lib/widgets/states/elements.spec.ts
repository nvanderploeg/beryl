import { describe, expect, it } from 'vitest';
import demo from '#lib/fixtures/demo-grill.json' with { type: 'json' };
import type { DemoFixture } from '#lib/fixtures/types.ts';
import type { Widget } from '#lib/types.ts';
import { elementsOf } from '../elements.ts';
import { elements } from './elements.ts';
import { layout } from '../shared/graph.ts';

function demoWidgets(type: string): Widget[] {
	return (demo as DemoFixture).turns.flatMap((t) =>
		(t.nodes ?? []).flatMap((n) => (n.widgets ?? []).filter((w) => w.type === type))
	);
}

describe('states elements', () => {
	const states = ['pending', 'accepted', 'declined', 'expired', 'revoked'];
	const transitions = [
		'pending->accepted',
		'pending->declined',
		'pending->expired',
		'pending->revoked'
	];

	it('lists states then transitions, keyed from->to by default, for the invite lifecycle', () => {
		const [first, last] = demoWidgets('states');
		expect(elementsOf(first).map((e) => e.key)).toEqual([...states, ...transitions]);
		expect(elementsOf(last).map((e) => e.key)).toEqual([...states, ...transitions, 'resend']);
	});

	it('labels transitions by their state labels and event', () => {
		const [, last] = demoWidgets('states');
		const labels = Object.fromEntries(elementsOf(last).map((e) => [e.key, e.label]));
		expect(labels['pending->expired']).toBe('Pending → Expired: 7 days');
		expect(labels.resend).toBe('Pending → Pending: resend');
	});

	it('omits the colon for a transition without a label', () => {
		expect(
			elements({
				states: [
					{ key: 'a', label: 'A' },
					{ key: 'b', label: 'B' }
				],
				transitions: [{ from: 'a', to: 'b' }]
			}).at(-1)
		).toEqual({ key: 'a->b', label: 'A → B' });
	});
});

describe('graph layout', () => {
	it('splits a labelled edge around a label box and leaves self-loops unrouted', async () => {
		const graph = await layout(
			[
				{ id: 'a', width: 80, height: 30 },
				{ id: 'b', width: 80, height: 30 }
			],
			[
				{ id: 'e', source: 'a', target: 'b', label: { width: 40, height: 16 } },
				{ id: 'loop', source: 'a', target: 'a' }
			],
			{ 'elk.direction': 'RIGHT' }
		);
		const edge = graph.edges.e;
		expect(edge.label).toMatchObject({ width: 40, height: 16 });
		expect(edge.before.length).toBeGreaterThanOrEqual(2);
		expect(edge.after.length).toBeGreaterThanOrEqual(2);
		expect(edge.before.at(-1)!.x).toBeCloseTo(edge.label!.x);
		expect(edge.after[0].x).toBeCloseTo(edge.label!.x + edge.label!.width);
		expect(graph.edges.loop).toBeUndefined();
		expect(Object.keys(graph.boxes).sort()).toEqual(['a', 'b']);
	});
});
