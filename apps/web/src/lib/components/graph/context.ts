import { getContext, setContext } from 'svelte';
import type { Box, GraphLayout } from '#lib/ui/graph-layout.ts';
export { drawnAt } from '#lib/ui/graph-layout.ts';
import type { Lod } from '#lib/ui/topic.ts';

export interface GraphContext {
	readonly lod: Lod;
	readonly zoom: number;
	readonly layout: GraphLayout | null;
	fit(path: string): void;
}

export interface BoxData extends Record<string, unknown> {
	box: Box;
	depth: number;
}

const GRAPH = Symbol('graph');

export function provideGraph(ctx: GraphContext): void {
	setContext(GRAPH, ctx);
}

export function useGraph(): GraphContext {
	return getContext<GraphContext>(GRAPH);
}

export function tiledAt(box: Box, depth: number, lod: Lod): boolean {
	if (box.shape === 'tile') return true;
	if (box.shape !== 'container') return false;
	return (lod === 'far' && depth === 1) || (lod === 'mid' && depth === 2);
}
