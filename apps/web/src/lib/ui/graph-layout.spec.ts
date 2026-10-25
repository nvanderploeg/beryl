import { describe, expect, it } from 'vitest';
import demo from '#lib/fixtures/demo-grill.json' with { type: 'json' };
import { foldTurns } from '#lib/fixtures/fold.ts';
import type { DemoFixture } from '#lib/fixtures/types.ts';
import type { Node } from '../types.ts';
import {
	absoluteBox,
	boxDepth,
	drawnAt,
	layoutGraph,
	layoutKey,
	routeEdges,
	stubId,
	visibleFor
} from './graph-layout.ts';

const nodes = foldTurns(demo as DemoFixture).nodes;
const expanded = () => false;

function inside(
	outer: { x: number; y: number; width: number; height: number },
	inner: typeof outer
) {
	return (
		inner.x >= outer.x &&
		inner.y >= outer.y &&
		inner.x + inner.width <= outer.x + outer.width &&
		inner.y + inner.height <= outer.y + outer.height
	);
}

describe('layoutGraph', () => {
	it('nests every child inside its container', async () => {
		const layout = await layoutGraph(nodes, expanded);
		for (const n of nodes) {
			if (!n.parentPath) continue;
			const parent = absoluteBox(layout, n.parentPath)!;
			const child = absoluteBox(layout, n.path)!;
			expect(inside(parent, child), `${n.path} inside ${n.parentPath}`).toBe(true);
			expect(layout.boxes.get(n.path)?.parent).toBe(n.parentPath);
		}
	});

	it('lists parents before children, as Svelte Flow needs', async () => {
		const layout = await layoutGraph(nodes, expanded);
		for (const [i, id] of layout.order.entries()) {
			const parent = layout.boxes.get(id)?.parent;
			if (parent) expect(layout.order.indexOf(parent)).toBeLessThan(i);
		}
	});

	it('lays what a node relies on before it within one container', async () => {
		const layout = await layoutGraph(nodes, expanded);
		const plan = absoluteBox(layout, 'migration/plan')!;
		const deploys = absoluteBox(layout, 'migration/deploys')!;
		expect(plan.x + plan.width).toBeLessThanOrEqual(deploys.x);
	});

	it('keeps boxes still across a content-only update', async () => {
		const edited = nodes.map((n) =>
			n.path === 'tenancy/model' ? { ...n, gist: 'A new gist', status: 'open' as const } : n
		);
		expect(layoutKey(edited, expanded)).toBe(layoutKey(nodes, expanded));
	});

	it('changes the key when a node is added or a container collapses', () => {
		const added: Node[] = [
			...nodes,
			{ ...nodes.at(-1)!, path: 'spec/extra', key: 'extra', position: 9 }
		];
		expect(layoutKey(added, expanded)).not.toBe(layoutKey(nodes, expanded));
		expect(layoutKey(nodes, (n) => n.path === 'data')).not.toBe(layoutKey(nodes, expanded));
	});

	it('draws a collapsed container as a tile and leaves its children out', async () => {
		const layout = await layoutGraph(nodes, (n) => n.path === 'data');
		expect(layout.boxes.get('data')?.shape).toBe('tile');
		expect(layout.boxes.has('data/schema')).toBe(false);
	});

	it('adds a missing-target stub beside the node with a dangling edge', async () => {
		const dangling = nodes.map((n) =>
			n.path === 'ui/switcher' ? { ...n, edges: [{ rel: 'relies_on' as const, to: 'ui/gone' }] } : n
		);
		const layout = await layoutGraph(dangling, expanded);
		const stub = layout.boxes.get(stubId('ui/switcher', 'ui/gone'));
		expect(stub?.shape).toBe('stub');
		expect(stub?.parent).toBe('ui');
		expect(stub?.path).toBe('ui/gone');
	});
});

describe('routeEdges', () => {
	it('runs relies_on from the relied-on node to the one relying on it', async () => {
		const layout = await layoutGraph(nodes, expanded);
		const edges = routeEdges(layout, nodes, 'near');
		expect(edges).toContainEqual(
			expect.objectContaining({
				source: 'migration/plan',
				target: 'migration/deploys',
				rel: 'relies_on'
			})
		);
	});

	it('lifts edges to the drawn tiles at far zoom and drops ones inside a tile', async () => {
		const layout = await layoutGraph(nodes, expanded);
		const far = routeEdges(layout, nodes, 'far');
		for (const e of far) {
			expect(boxDepth(layout, e.source)).toBe(1);
			expect(boxDepth(layout, e.target)).toBe(1);
			expect(e.source).not.toBe(e.target);
		}
		expect(far.some((e) => e.source === 'tenancy' && e.target === 'data' && e.lifted)).toBe(true);
	});
});

describe('helpers', () => {
	it('drawnAt shows one, two, then every level', () => {
		expect([drawnAt(1, 'far'), drawnAt(2, 'far')]).toEqual([true, false]);
		expect([drawnAt(2, 'mid'), drawnAt(3, 'mid')]).toEqual([true, false]);
		expect(drawnAt(6, 'near')).toBe(true);
	});

	it('visibleFor walks up to the nearest drawn ancestor', () => {
		const shown = new Set(['a', 'a/b']);
		expect(visibleFor('a/b/c/d', shown)).toBe('a/b');
		expect(visibleFor('z/y', shown)).toBeNull();
	});
});
