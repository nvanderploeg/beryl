import { layoutGraph, type LayoutBox, type LayoutLink, type LayoutResult } from '../elk.ts';
import type { Box, Point } from './geometry.ts';

export interface GraphEdge {
	id: string;
	source: string;
	target: string;
	label?: { width: number; height: number };
}

export interface RoutedEdge {
	id: string;
	// The route from source to target; split around the label when there is one.
	before: Point[];
	after: Point[];
	label?: Box;
}

export interface Graph {
	width: number;
	height: number;
	boxes: Record<string, Box>;
	edges: Record<string, RoutedEdge>;
}

const labelId = (edge: string) => `${edge}\u0000label`;

// Box ids must not end in "\u0000label".
// Self-loops get no route: draw them yourself.
export async function layout(
	boxes: LayoutBox[],
	edges: GraphEdge[],
	options: Record<string, string> = {}
): Promise<Graph> {
	const nodes = [...boxes];
	const links: LayoutLink[] = [];
	for (const e of edges) {
		if (e.source === e.target) continue;
		if (!e.label) {
			links.push({ id: e.id, source: e.source, target: e.target });
			continue;
		}
		nodes.push({ id: labelId(e.id), ...e.label });
		links.push({ id: `${e.id}:a`, source: e.source, target: labelId(e.id) });
		links.push({ id: `${e.id}:b`, source: labelId(e.id), target: e.target });
	}
	let result: LayoutResult;
	try {
		result = await layoutGraph(nodes, links, {
			'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
			'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
			...options
		});
	} catch {
		result = stack(boxes);
	}
	const graph: Graph = { width: result.width, height: result.height, boxes: {}, edges: {} };
	for (const b of boxes) if (result.boxes[b.id]) graph.boxes[b.id] = result.boxes[b.id];
	for (const e of edges) {
		if (e.source === e.target) continue;
		if (!e.label) {
			const route = result.links[e.id];
			if (route) graph.edges[e.id] = { id: e.id, before: route.points, after: [] };
			continue;
		}
		const a = result.links[`${e.id}:a`];
		const b = result.links[`${e.id}:b`];
		const label = result.boxes[labelId(e.id)];
		if (a && b && label) graph.edges[e.id] = { id: e.id, before: a.points, after: b.points, label };
	}
	return graph;
}

// Boxes in a column with no edges: every Element still shows when ELK fails.
function stack(boxes: LayoutBox[]): LayoutResult {
	const result: LayoutResult = { width: 0, height: 0, boxes: {}, links: {} };
	for (const b of boxes) {
		result.boxes[b.id] = { x: 0, y: result.height, width: b.width, height: b.height };
		result.height += b.height + 24;
		result.width = Math.max(result.width, b.width);
	}
	return result;
}

export function reversed(edge: RoutedEdge): RoutedEdge {
	const back = (points: Point[]) => [...points].reverse();
	return {
		...edge,
		before: back(edge.after.length ? edge.after : edge.before),
		after: edge.after.length ? back(edge.before) : []
	};
}

export function endpoints(edge: RoutedEdge) {
	const full = [...edge.before, ...edge.after];
	const start = full[0];
	const end = full[full.length - 1];
	const same = (a: Point, b: Point) => Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5;
	return {
		start,
		startNext: full.find((p) => !same(p, start)) ?? start,
		end,
		endPrev: full.findLast((p) => !same(p, end)) ?? end
	};
}
