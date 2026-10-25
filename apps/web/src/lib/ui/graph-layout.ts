import ELK from 'elkjs/lib/elk.bundled.js';
import type { ElkExtendedEdge, ElkNode } from 'elkjs/lib/elk-api.js';
import type { EdgeRel, Node } from '../types.ts';
import { byTree, type Lod } from './topic.ts';

export const CARD_W = 320;
export const TILE_W = 320;
export const TILE_H = 176;
export const STUB_W = 188;
export const STUB_H = 40;
export const HEAD_H = 76;
const PAD = 22;
const PREVIEW_H = 180;

export interface Box {
	id: string;
	parent: string | null;
	x: number;
	y: number;
	width: number;
	height: number;
	shape: 'card' | 'container' | 'tile' | 'stub';
	// The Path this box stands for; a stub stands for its missing target.
	path: string;
	from?: string;
}

export interface GraphLayout {
	key: string;
	boxes: Map<string, Box>;
	order: string[];
	width: number;
	height: number;
}

export function stubId(from: string, to: string): string {
	return `missing:${from}->${to}`;
}

function lines(text: string, perLine: number, max: number): number {
	if (!text) return 0;
	return Math.min(max, Math.ceil(text.length / perLine));
}

// Size for the near rendering: zoom never resizes a box.
export function cardSize(node: Node): { width: number; height: number } {
	let h = 18 + 22 + 8;
	h += lines(node.title, 30, 2) * 20;
	h += node.gist ? 8 + lines(node.gist, 44, 3) * 18 : 0;
	if (node.kind === 'decision' && (node.recommendation || node.answer)) {
		h += 12 + 16 + lines(node.answer || node.recommendation, 44, 3) * 18;
	}
	if (node.widgets.length) h += 14 + PREVIEW_H;
	return { width: CARD_W, height: Math.max(h, 112) };
}

interface Plan {
	key: string;
	visible: Node[];
	tiles: Set<string>;
	containers: Set<string>;
	stubs: { id: string; parent: string | null; from: string; to: string }[];
}

function plan(nodes: Node[], isCollapsed: (n: Node) => boolean): Plan {
	const sorted = [...nodes].sort(byTree);
	const paths = new Set(sorted.map((n) => n.path));
	const parents = new Set(sorted.map((n) => n.parentPath).filter((p): p is string => p !== null));
	const hidden = new Set<string>();
	const tiles = new Set<string>();
	const containers = new Set<string>();
	const visible: Node[] = [];
	for (const n of sorted) {
		if (n.parentPath !== null && (hidden.has(n.parentPath) || tiles.has(n.parentPath))) {
			hidden.add(n.path);
			continue;
		}
		visible.push(n);
		if (!parents.has(n.path)) continue;
		if (isCollapsed(n)) tiles.add(n.path);
		else containers.add(n.path);
	}
	const stubs: Plan['stubs'] = [];
	for (const n of visible) {
		for (const e of n.edges) {
			if (paths.has(e.to)) continue;
			const id = stubId(n.path, e.to);
			if (!stubs.some((s) => s.id === id))
				stubs.push({ id, parent: n.parentPath, from: n.path, to: e.to });
		}
	}
	const key = [
		...visible.map(
			(n) =>
				`${n.path}:${n.position}:${tiles.has(n.path) ? 't' : containers.has(n.path) ? 'c' : 'l'}`
		),
		...stubs.map((s) => s.id)
	].join('|');
	return { key, visible, tiles, containers, stubs };
}

export function layoutKey(nodes: Node[], isCollapsed: (n: Node) => boolean): string {
	return plan(nodes, isCollapsed).key;
}

export function visibleFor(path: string, shown: Set<string>): string | null {
	const parts = path.split('/');
	for (let i = parts.length; i > 0; i--) {
		const candidate = parts.slice(0, i).join('/');
		if (shown.has(candidate)) return candidate;
	}
	return null;
}

// The child of `ancestor` (or a root when null) that contains `path`.
function childUnder(path: string, ancestor: string | null): string {
	const parts = path.split('/');
	const depth = ancestor === null ? 1 : ancestor.split('/').length + 1;
	return parts.slice(0, depth).join('/');
}

function commonParent(a: string, b: string): string | null {
	const pa = a.split('/');
	const pb = b.split('/');
	const shared: string[] = [];
	for (let i = 0; i < Math.min(pa.length, pb.length) - 1; i++) {
		if (pa[i] !== pb[i]) break;
		shared.push(pa[i]);
	}
	return shared.length ? shared.join('/') : null;
}

let elk: InstanceType<typeof ELK> | undefined;

export async function layoutGraph(
	nodes: Node[],
	isCollapsed: (n: Node) => boolean
): Promise<GraphLayout> {
	elk ??= new ELK();
	const p = plan(nodes, isCollapsed);
	const shown = new Set(p.visible.map((n) => n.path));
	const elkNodes = new Map<string, ElkNode>();
	const childrenOf = new Map<string | null, ElkNode[]>();
	const push = (parent: string | null, child: ElkNode) => {
		const list = childrenOf.get(parent) ?? [];
		list.push(child);
		childrenOf.set(parent, list);
	};

	for (const n of p.visible) {
		const size = p.containers.has(n.path)
			? {}
			: p.tiles.has(n.path)
				? { width: TILE_W, height: TILE_H }
				: cardSize(n);
		const el: ElkNode = { id: n.path, ...size };
		elkNodes.set(n.path, el);
		push(n.parentPath, el);
	}
	for (const s of p.stubs) {
		const el: ElkNode = { id: s.id, width: STUB_W, height: STUB_H };
		elkNodes.set(s.id, el);
		push(s.parent, el);
	}

	// Give ELK sibling edges only: SEPARATE_CHILDREN ignores edges that cross a container.
	const levelEdges = new Map<string | null, ElkExtendedEdge[]>();
	const seen = new Set<string>();
	const addEdge = (scope: string | null, source: string, target: string) => {
		const id = `${scope ?? ''}:${source}->${target}`;
		if (source === target || seen.has(id)) return;
		seen.add(id);
		const list = levelEdges.get(scope) ?? [];
		list.push({ id, sources: [source], targets: [target] });
		levelEdges.set(scope, list);
	};
	const exists = new Set(nodes.map((n) => n.path));
	for (const n of nodes) {
		for (const e of n.edges) {
			if (e.rel !== 'relies_on') continue;
			if (!exists.has(e.to)) {
				const stub = stubId(n.path, e.to);
				if (elkNodes.has(stub)) addEdge(n.parentPath, stub, n.path);
				continue;
			}
			const from = visibleFor(n.path, shown);
			const to = visibleFor(e.to, shown);
			if (!from || !to || from === to) continue;
			if (to.startsWith(`${from}/`) || from.startsWith(`${to}/`)) continue;
			const scope = commonParent(from, to);
			addEdge(scope, childUnder(to, scope), childUnder(from, scope));
		}
	}

	const build = (parent: string | null): ElkNode[] =>
		(childrenOf.get(parent) ?? []).map((el) => {
			if (!p.containers.has(el.id)) return el;
			const kids = build(el.id);
			const edges = levelEdges.get(el.id) ?? [];
			return {
				...el,
				children: kids,
				edges,
				layoutOptions: levelOptions(edges.length > 0, kids.length, {
					'elk.padding': `[top=${HEAD_H},left=${PAD},bottom=${PAD},right=${PAD}]`
				})
			};
		});

	const rootEdges = levelEdges.get(null) ?? [];
	const rootKids = build(null);
	const graph: ElkNode = await elk.layout({
		id: '__root',
		children: rootKids,
		edges: rootEdges,
		layoutOptions: {
			...levelOptions(rootEdges.length > 0, rootKids.length, {
				'elk.padding': '[top=0,left=0,bottom=0,right=0]',
				'elk.spacing.nodeNode': '56',
				'elk.layered.spacing.nodeNodeBetweenLayers': '72',
				'elk.spacing.componentComponent': '72'
			}),
			'elk.hierarchyHandling': 'SEPARATE_CHILDREN'
		}
	});

	const boxes = new Map<string, Box>();
	const order: string[] = [];
	const byId = new Map(p.visible.map((n) => [n.path, n]));
	const stubs = new Map(p.stubs.map((s) => [s.id, s]));
	const walk = (list: ElkNode[] | undefined, parent: string | null) => {
		for (const el of list ?? []) {
			const stub = stubs.get(el.id);
			const node = byId.get(el.id);
			boxes.set(el.id, {
				id: el.id,
				parent,
				x: el.x ?? 0,
				y: el.y ?? 0,
				width: el.width ?? 0,
				height: el.height ?? 0,
				shape: stub
					? 'stub'
					: p.containers.has(el.id)
						? 'container'
						: p.tiles.has(el.id)
							? 'tile'
							: 'card',
				path: stub ? stub.to : (node?.path ?? el.id),
				from: stub?.from
			});
			order.push(el.id);
			walk(el.children, el.id);
		}
	};
	walk(graph.children, null);
	return { key: p.key, boxes, order, width: graph.width ?? 0, height: graph.height ?? 0 };
}

function levelOptions(
	layered: boolean,
	count: number,
	extra: Record<string, string>
): Record<string, string> {
	if (layered) {
		return {
			'elk.algorithm': 'layered',
			'elk.direction': 'RIGHT',
			'elk.spacing.nodeNode': '24',
			'elk.layered.spacing.nodeNodeBetweenLayers': '56',
			'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
			'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
			'elk.spacing.componentComponent': '32',
			'elk.aspectRatio': count > 3 ? '1.8' : '3',
			...extra
		};
	}
	return {
		'elk.algorithm': 'rectpacking',
		'elk.spacing.nodeNode': '24',
		'elk.aspectRatio': '1.8',
		...extra
	};
}

export function absoluteBox(
	layout: GraphLayout,
	id: string
): { x: number; y: number; width: number; height: number } | null {
	const box = layout.boxes.get(id);
	if (!box) return null;
	let x = box.x;
	let y = box.y;
	let parent = box.parent;
	while (parent !== null) {
		const p = layout.boxes.get(parent);
		if (!p) break;
		x += p.x;
		y += p.y;
		parent = p.parent;
	}
	return { x, y, width: box.width, height: box.height };
}

export function drawnAt(depth: number, lod: Lod): boolean {
	if (lod === 'far') return depth <= 1;
	if (lod === 'mid') return depth <= 2;
	return true;
}

export function boxDepth(layout: GraphLayout, id: string): number {
	const box = layout.boxes.get(id);
	if (!box) return 1;
	if (box.shape === 'stub') return box.parent ? box.parent.split('/').length + 1 : 1;
	return box.path.split('/').length;
}

function drawnBox(layout: GraphLayout, path: string, lod: Lod): string | null {
	const parts = path.split('/');
	for (let i = parts.length; i > 0; i--) {
		const candidate = parts.slice(0, i).join('/');
		if (layout.boxes.has(candidate) && drawnAt(i, lod)) return candidate;
	}
	return null;
}

export interface RoutedEdge {
	id: string;
	source: string;
	target: string;
	rel: EdgeRel;
	lifted: boolean;
	label: string;
}

// relies_on runs from the relied-on node, as the layout layers it: flip both or neither.
export function routeEdges(layout: GraphLayout, nodes: Node[], lod: Lod): RoutedEdge[] {
	const byId = new Map<string, RoutedEdge>();
	const exists = new Set(nodes.map((n) => n.path));
	for (const n of nodes) {
		for (const e of n.edges) {
			const source = drawnBox(layout, n.path, lod);
			let target: string | null;
			let lifted = false;
			if (!exists.has(e.to)) {
				const stub = stubId(n.path, e.to);
				target = layout.boxes.has(stub) && drawnAt(boxDepth(layout, stub), lod) ? stub : null;
			} else {
				target = drawnBox(layout, e.to, lod);
				lifted = source !== n.path || target !== e.to;
			}
			if (!source || !target || source === target) continue;
			if (target.startsWith(`${source}/`) || source.startsWith(`${target}/`)) continue;
			const [from, to] = e.rel === 'relies_on' ? [target, source] : [source, target];
			const id = `${e.rel}:${from}->${to}`;
			if (byId.has(id)) continue;
			byId.set(id, { id, source: from, target: to, rel: e.rel, lifted, label: e.label ?? '' });
		}
	}
	return [...byId.values()];
}
