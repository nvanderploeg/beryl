<script lang="ts">
	import { onMount, tick, untrack } from 'svelte';
	import {
		Background,
		BackgroundVariant,
		ControlButton,
		Controls,
		MiniMap,
		SvelteFlow,
		useSvelteFlow,
		type Edge as FlowEdge,
		type Node as FlowNode
	} from '@xyflow/svelte';
	import type { Node } from '#lib/types.ts';
	import { useBoard } from '#lib/ui/board.svelte.ts';
	import {
		absoluteBox,
		boxDepth,
		drawnAt,
		layoutGraph,
		layoutKey,
		routeEdges,
		type GraphLayout
	} from '#lib/ui/graph-layout.ts';
	import { toneOf } from '#lib/ui/kinds.ts';
	import { theme } from '#lib/ui/theme.svelte.ts';
	import { LOD_MID, LOD_NEAR, lodFor } from '#lib/ui/topic.ts';
	import { provideGraph, type BoxData } from './context.ts';
	import CardNode from './CardNode.svelte';
	import GroupNode from './GroupNode.svelte';
	import StubNode from './StubNode.svelte';
	import RelEdge from './RelEdge.svelte';

	const board = useBoard();
	const flow = useSvelteFlow();

	const nodeTypes = { pwcard: CardNode, pwgroup: GroupNode, pwstub: StubNode };
	const edgeTypes = { rel: RelEdge };

	let layout: GraphLayout | null = $state.raw(null);
	let zoom = $state(0.35);
	let width = $state(0);
	let height = $state(0);
	let ready = $state(false);
	const lod = $derived(lodFor(zoom));

	const collapsed = (n: Node) => board.isCollapsed(n);
	const key = $derived(layoutKey(board.nodes, collapsed));

	provideGraph({
		get lod() {
			return lod;
		},
		get zoom() {
			return zoom;
		},
		get layout() {
			return layout;
		},
		fit: (path) => void fitBox(path, { minZoom: 0.05, maxZoom: 1.6 })
	});

	$effect(() => {
		void key;
		const nodes = untrack(() => board.nodes);
		let cancelled = false;
		layoutGraph(nodes, collapsed)
			.then((next) => {
				if (!cancelled) layout = next;
			})
			.catch((e) => console.error('graph layout failed', e));
		return () => {
			cancelled = true;
		};
	});

	let nodes: FlowNode<BoxData>[] = $state.raw([]);
	let edges: FlowEdge[] = $state.raw([]);

	$effect(() => {
		const l = layout;
		const level = lod;
		if (!l) return;
		nodes = l.order.map((id) => {
			const box = l.boxes.get(id)!;
			const depth = boxDepth(l, id);
			return {
				id,
				type: box.shape === 'card' ? 'pwcard' : box.shape === 'stub' ? 'pwstub' : 'pwgroup',
				position: { x: box.x, y: box.y },
				parentId: box.parent ?? undefined,
				width: box.width,
				height: box.height,
				data: { box, depth },
				hidden: !drawnAt(depth, level),
				draggable: false,
				connectable: false,
				selectable: false,
				deletable: false,
				focusable: false
			};
		});
	});

	$effect(() => {
		const l = layout;
		const level = lod;
		const all = board.nodes;
		if (!l) return;
		edges = routeEdges(l, all, level).map((e) => ({
			id: e.id,
			type: 'rel',
			source: e.source,
			target: e.target,
			data: { rel: e.rel, lifted: e.lifted, label: e.label },
			selectable: false,
			deletable: false,
			focusable: false
		}));
	});

	async function waitFor(path: string): Promise<GraphLayout | null> {
		for (let i = 0; i < 80; i++) {
			if (layout && layout.key === key && layout.boxes.has(path)) {
				await tick();
				return layout;
			}
			await new Promise((r) => setTimeout(r, 25));
		}
		return layout?.boxes.has(path) ? layout : null;
	}

	async function fitBox(
		path: string,
		opts: { minZoom: number; maxZoom: number; duration?: number }
	): Promise<void> {
		const l = await waitFor(path);
		if (!l) return;
		const rect = absoluteBox(l, path);
		if (!rect || !width || !height) return;
		const pad = Math.min(96, Math.min(width, height) * 0.12);
		const fit = Math.min((width - pad * 2) / rect.width, (height - pad * 2) / rect.height);
		const z = Math.max(opts.minZoom, Math.min(opts.maxZoom, fit));
		await flow.setCenter(rect.x + rect.width / 2, rect.y + rect.height / 2, {
			zoom: z,
			duration: opts.duration ?? 560
		});
		zoom = flow.getZoom();
	}

	// Fit from the layout's bounds, not fitView: the flow may not have measured its nodes yet.
	async function fitAll(duration: number) {
		const l = layout;
		if (!l || !width || !height) return;
		const pad = 48;
		const fit = Math.min((width - pad * 2) / l.width, (height - pad * 2) / l.height);
		const z = Math.max(0.04, Math.min(LOD_MID * 0.98, fit));
		await flow.setCenter(l.width / 2, l.height / 2, { zoom: z, duration });
		zoom = flow.getZoom();
	}

	function flyTo(path: string, animate: boolean) {
		void fitBox(path, { minZoom: LOD_NEAR, maxZoom: 1.25, duration: animate ? 620 : 0 });
	}

	let lastFlight = untrack(() => board.flight?.n ?? 0);
	$effect(() => {
		const f = board.flight;
		if (!f || f.n === lastFlight) return;
		lastFlight = f.n;
		untrack(() => flyTo(f.path, true));
	});

	$effect(() => {
		if (ready || !layout || !width) return;
		ready = true;
		untrack(() => {
			void tick().then(async () => {
				const selected = board.selected;
				if (selected && layout?.boxes.has(selected)) flyTo(selected, false);
				else await fitAll(0);
			});
		});
	});

	onMount(() => {
		zoom = flow.getZoom() || zoom;
	});

	function minimapColor(n: FlowNode): string {
		const data = n.data as BoxData;
		if (data.box.shape === 'stub') return 'var(--removed)';
		if (data.box.shape !== 'card') return 'transparent';
		const node = board.byPath.get(data.box.path);
		if (!node) return 'var(--line)';
		const tone = toneOf(node);
		if (tone === 'unknown' || tone === 'assume') return 'var(--accent)';
		if (tone === 'risk') return 'var(--risk)';
		if (tone === 'fog') return 'var(--fog)';
		if (tone === 'settled') return 'color-mix(in srgb, var(--settled) 55%, transparent)';
		return 'var(--line)';
	}

	function minimapStroke(n: FlowNode): string {
		const data = n.data as BoxData;
		return data.box.shape === 'container' || data.box.shape === 'tile'
			? 'var(--muted)'
			: 'transparent';
	}
</script>

<div
	class="graph lod-{lod}"
	style:--z={zoom}
	bind:clientWidth={width}
	bind:clientHeight={height}
	data-testid="graph-view"
	data-lod={lod}
>
	<svg class="defs" aria-hidden="true" width="0" height="0">
		<defs>
			<marker
				id="pw-arrow"
				viewBox="0 0 10 10"
				refX="9"
				refY="5"
				markerWidth="7"
				markerHeight="7"
				orient="auto-start-reverse"
			>
				<path d="M0 0 10 5 0 10Z" class="m-solid" />
			</marker>
			<marker
				id="pw-arrow-hollow"
				viewBox="0 0 12 12"
				refX="10.5"
				refY="6"
				markerWidth="9"
				markerHeight="9"
				orient="auto-start-reverse"
			>
				<path d="M1 1 11 6 1 11Z" class="m-hollow" />
			</marker>
			<marker
				id="pw-bar"
				viewBox="0 0 10 10"
				refX="5"
				refY="5"
				markerWidth="8"
				markerHeight="8"
				orient="auto"
			>
				<path d="M5 0v10" class="m-bar" />
			</marker>
		</defs>
	</svg>
	<SvelteFlow
		bind:nodes
		bind:edges
		{nodeTypes}
		{edgeTypes}
		colorMode={theme.resolved}
		minZoom={0.04}
		maxZoom={2.5}
		zoomOnDoubleClick={false}
		nodesDraggable={false}
		nodesConnectable={false}
		elementsSelectable={false}
		nodesFocusable={false}
		edgesFocusable={false}
		zIndexMode="auto"
		onlyRenderVisibleElements
		onmove={(_, viewport) => (zoom = viewport.zoom)}
		onnodeclick={({ node }) => {
			const box = (node.data as BoxData).box;
			board.select(box.shape === 'stub' ? (box.from ?? null) : box.path);
		}}
		proOptions={{ hideAttribution: false }}
		attributionPosition="top-right"
	>
		<Background variant={BackgroundVariant.Dots} gap={28} size={1.2} />
		<Controls position="bottom-left" showLock={false} showFitView={false}>
			<ControlButton
				title="Fit the whole board"
				aria-label="Fit the whole board"
				onclick={() => fitAll(400)}
			>
				<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
					<path
						d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4"
						fill="none"
						stroke="currentColor"
						stroke-width="1.6"
					/>
				</svg>
			</ControlButton>
		</Controls>
		<MiniMap
			position="bottom-right"
			nodeColor={minimapColor}
			nodeStrokeColor={minimapStroke}
			nodeStrokeWidth={6}
			nodeBorderRadius={10}
			pannable
			zoomable
			width={180}
			height={120}
		/>
	</SvelteFlow>
	<div class="lod-badge" aria-live="polite">
		<span class:on={lod === 'far'}>Areas</span>
		<span class:on={lod === 'mid'}>Cards</span>
		<span class:on={lod === 'near'}>Detail</span>
	</div>
	{#if board.nodes.length === 0}
		<p class="empty">Nothing on the board yet. Nodes appear here as the agent writes them.</p>
	{/if}
</div>

<style>
	.graph {
		position: absolute;
		inset: 0;
	}
	.defs {
		position: absolute;
	}
	.graph :global(.m-solid) {
		fill: color-mix(in srgb, var(--ink) 55%, transparent);
	}
	.graph :global(.m-hollow) {
		fill: var(--bg);
		stroke: color-mix(in srgb, var(--ink) 60%, transparent);
		stroke-width: 1.4;
	}
	.graph :global(.m-bar) {
		stroke: var(--removed);
		stroke-width: 2;
	}
	.graph :global(.svelte-flow) {
		--xy-background-color: var(--bg);
		--xy-background-pattern-dots-color-default: color-mix(in srgb, var(--muted) 28%, transparent);
		--xy-minimap-background-color-default: var(--surface);
		--xy-minimap-mask-background-color-default: color-mix(in srgb, var(--bg) 70%, transparent);
		--xy-minimap-mask-stroke-color-default: var(--line);
		--xy-minimap-node-background-color-default: var(--line);
		--xy-controls-button-background-color-default: var(--surface);
		--xy-controls-button-background-color-hover-default: var(--surface-2);
		--xy-controls-button-color-default: var(--ink);
		--xy-controls-button-color-hover-default: var(--ink);
		--xy-controls-button-border-color-default: var(--line);
		--xy-controls-box-shadow-default: 0 1px 3px rgb(0 0 0 / 0.2);
		--xy-attribution-background-color-default: transparent;
		--xy-edge-stroke-default: color-mix(in srgb, var(--ink) 40%, transparent);
		--xy-node-border-radius-default: 12px;
		background: var(--bg);
		font-family: var(--font-sans);
	}
	.graph :global(.svelte-flow__attribution a) {
		color: var(--muted);
		opacity: 0.6;
	}
	.graph :global(.svelte-flow__minimap) {
		border: 1px solid var(--line);
		border-radius: 10px;
		overflow: hidden;
	}
	.graph :global(.svelte-flow__controls) {
		border-radius: 8px;
		overflow: hidden;
		border: 1px solid var(--line);
	}
	.graph :global(.svelte-flow__node) {
		cursor: pointer;
		text-align: left;
	}
	.lod-badge {
		position: absolute;
		left: 12px;
		top: 12px;
		z-index: 5;
		display: flex;
		gap: 2px;
		padding: 3px;
		border-radius: 8px;
		background: color-mix(in srgb, var(--surface) 85%, transparent);
		border: 1px solid var(--line);
		font-size: 0.72rem;
		color: var(--muted);
		pointer-events: none;
	}
	.lod-badge span {
		padding: 0.1rem 0.45rem;
		border-radius: 5px;
	}
	.lod-badge span.on {
		background: var(--surface-2);
		color: var(--ink);
	}
	.empty {
		position: absolute;
		inset: 40% 0 auto;
		text-align: center;
		color: var(--muted);
	}
	@media (max-width: 900px) {
		.graph :global(.svelte-flow__minimap) {
			display: none;
		}
		.graph :global(.svelte-flow__controls) {
			bottom: 64px;
		}
		.lod-badge {
			top: auto;
			bottom: 70px;
			left: auto;
			right: 12px;
		}
	}
</style>
