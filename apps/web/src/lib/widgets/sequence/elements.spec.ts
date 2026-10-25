import { describe, expect, it } from 'vitest';
import demo from '#lib/fixtures/demo-grill.json' with { type: 'json' };
import type { DemoFixture } from '#lib/fixtures/types.ts';
import type { Widget } from '#lib/types.ts';
import type { SequenceData } from '../types.ts';
import { elementsOf } from '../elements.ts';
import { layoutSequence } from './layout.ts';

function demoWidgets(type: string): Widget[] {
	return (demo as DemoFixture).turns.flatMap((t) =>
		(t.nodes ?? []).flatMap((n) => (n.widgets ?? []).filter((w) => w.type === type))
	);
}

describe('sequence elements', () => {
	it('lists actors then steps, for the invite flow before and after the note', () => {
		const [first, last] = demoWidgets('sequence');
		const actors = ['owner', 'app', 'mail', 'guest'];
		expect(elementsOf(first).map((e) => e.key)).toEqual([...actors, 's1', 's2', 's3', 's4', 's5']);
		expect(elementsOf(last).map((e) => e.key)).toEqual([
			...actors,
			's1',
			's2',
			's3',
			's4',
			's5',
			'n1'
		]);
	});

	it('labels messages by their ends and notes by what they cover', () => {
		const [, last] = demoWidgets('sequence');
		const labels = Object.fromEntries(elementsOf(last).map((e) => [e.key, e.label]));
		expect(labels.owner).toBe('Owner');
		expect(labels.s1).toBe('Owner → Tracker: invite(email, role)');
		expect(labels.n1).toBe('note over Owner–Tracker: resend restarts the 7 days');
	});
});

describe('sequence layout', () => {
	const data: SequenceData = {
		actors: [
			{ key: 'a', label: 'A' },
			{ key: 'b', label: 'B' }
		],
		steps: [
			{
				key: 'm',
				from: 'a',
				to: 'b',
				label: 'a label long enough to need a wider gap than the minimum'
			},
			{ key: 'self', from: 'b', to: 'b', label: 'loop' },
			{ key: 'back', from: 'b', to: 'a', label: 'ok', kind: 'reply' }
		]
	};

	it('places steps top to bottom in order, one row each', () => {
		const laid = layoutSequence(data, false);
		const tops = laid.steps.map((s) => s.box.y);
		expect(tops).toEqual([...tops].sort((x, y) => x - y));
		expect(new Set(tops).size).toBe(3);
		expect(laid.lifeline.bottom).toBeGreaterThan(tops[2]);
	});

	it('widens the gap between lifelines to fit a message label', () => {
		const laid = layoutSequence(data, false);
		const [a, b] = laid.actors;
		const message = laid.steps[0];
		expect(b.x - a.x).toBeGreaterThanOrEqual(message.box.width);
		expect(message.box.width).toBeGreaterThan(200);
	});

	it('draws a self-call as a loop that leaves and returns to the same lifeline', () => {
		const self = layoutSequence(data, false).steps[1];
		expect(self.type).toBe('self');
		if (self.type !== 'self') return;
		const b = layoutSequence(data, false).actors[1];
		expect(self.points[0].x).toBe(b.x);
		expect(self.points[1].x).toBeGreaterThan(b.x);
		expect(self.points.at(-1)!.x).toBeGreaterThan(b.x);
		expect(self.points.at(-1)!.y).toBeGreaterThan(self.points[0].y);
	});

	it('gives calls a filled head and replies an open one', () => {
		const [call, , reply] = layoutSequence(data, false).steps;
		expect(call.type === 'message' && call.head.filled).toBe(true);
		expect(reply.type === 'message' && reply.head.filled).toBe(false);
	});

	it('skips steps whose actors are missing instead of throwing', () => {
		const laid = layoutSequence(
			{ ...data, steps: [...data.steps, { key: 'x', from: 'a', to: 'ghost', label: 'lost' }] },
			false
		);
		expect(laid.steps.map((s) => s.key)).toEqual(['m', 'self', 'back']);
	});
});
