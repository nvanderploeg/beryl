import ELK from 'elkjs/lib/elk.bundled.js';
import type { ElkNode } from 'elkjs/lib/elk-api.js';

export interface LayoutBox {
	id: string;
	width: number;
	height: number;
}

export interface LayoutLink {
	id: string;
	source: string;
	target: string;
}

export interface LayoutResult {
	width: number;
	height: number;
	boxes: Record<string, { x: number; y: number; width: number; height: number }>;
	links: Record<string, { points: { x: number; y: number }[] }>;
}

let elk: InstanceType<typeof ELK> | undefined;

export async function layoutGraph(
	boxes: LayoutBox[],
	links: LayoutLink[],
	options: Record<string, string> = {}
): Promise<LayoutResult> {
	elk ??= new ELK();
	const ids = new Set(boxes.map((b) => b.id));
	const input: ElkNode = {
		id: 'root',
		layoutOptions: {
			'elk.algorithm': 'layered',
			'elk.direction': 'DOWN',
			'elk.edgeRouting': 'ORTHOGONAL',
			'elk.spacing.nodeNode': '32',
			'elk.layered.spacing.nodeNodeBetweenLayers': '48',
			...options
		},
		children: boxes.map((b) => ({ id: b.id, width: b.width, height: b.height })),
		edges: links
			.filter((l) => ids.has(l.source) && ids.has(l.target))
			.map((l) => ({ id: l.id, sources: [l.source], targets: [l.target] }))
	};
	const graph = await elk.layout(input);
	const result: LayoutResult = {
		width: graph.width ?? 0,
		height: graph.height ?? 0,
		boxes: {},
		links: {}
	};
	for (const child of graph.children ?? []) {
		result.boxes[child.id] = {
			x: child.x ?? 0,
			y: child.y ?? 0,
			width: child.width ?? 0,
			height: child.height ?? 0
		};
	}
	for (const edge of graph.edges ?? []) {
		const points = (edge.sections ?? []).flatMap((s) => [
			s.startPoint,
			...(s.bendPoints ?? []),
			s.endPoint
		]);
		result.links[edge.id] = { points };
	}
	return result;
}
