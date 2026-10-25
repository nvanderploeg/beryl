import { hierarchy, treemap, treemapSquarify, type HierarchyRectangularNode } from 'd3-hierarchy';
import type { Node } from '../types.ts';
import { childrenOf } from './topic.ts';

export const LABEL_H = 22;

export interface Cell {
	path: string;
	node: Node;
	container: boolean;
	depth: number;
	leaves: number;
	x: number;
	y: number;
	width: number;
	height: number;
}

interface Datum {
	node: Node | null;
	kids: Datum[];
}

function tree(nodes: Node[], parent: string | null): Datum[] {
	return childrenOf(nodes, parent).map((node) => ({ node, kids: tree(nodes, node.path) }));
}

// Weights follow docs/ui.md § Map.
export function treemapCells(
	nodes: Node[],
	focus: string | null,
	width: number,
	height: number
): Cell[] {
	if (width <= 0 || height <= 0) return [];
	const root: Datum = { node: null, kids: tree(nodes, focus) };
	if (root.kids.length === 0) return [];
	const h = hierarchy<Datum>(root, (d) => d.kids).sum((d) => (d.kids.length === 0 ? 1 : 0));
	const laid: HierarchyRectangularNode<Datum> = treemap<Datum>()
		.tile(treemapSquarify.ratio(1.4))
		.size([width, height])
		.paddingOuter((d) => (d.depth === 0 ? 0 : 4))
		.paddingTop((d) => (d.depth === 0 ? 0 : LABEL_H + 4))
		.paddingInner(4)
		.round(true)(h);
	const cells: Cell[] = [];
	for (const d of laid.descendants()) {
		if (!d.data.node) continue;
		cells.push({
			path: d.data.node.path,
			node: d.data.node,
			container: d.data.kids.length > 0,
			depth: d.depth,
			leaves: d.value ?? 0,
			x: d.x0,
			y: d.y0,
			width: Math.max(0, d.x1 - d.x0),
			height: Math.max(0, d.y1 - d.y0)
		});
	}
	return cells;
}
