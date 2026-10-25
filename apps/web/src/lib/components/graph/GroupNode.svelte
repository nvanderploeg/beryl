<script lang="ts">
	import { Handle, Position, type NodeProps, type Node as FlowNode } from '@xyflow/svelte';
	import { useBoard } from '#lib/ui/board.svelte.ts';
	import { absoluteBox } from '#lib/ui/graph-layout.ts';
	import { toneOf } from '#lib/ui/kinds.ts';
	import { countsOf, descendantsOf, isUnknown, progressOf } from '#lib/ui/topic.ts';
	import Mark from '../Mark.svelte';
	import { tiledAt, useGraph, type BoxData } from './context.ts';

	let { data }: NodeProps<FlowNode<BoxData>> = $props();

	const board = useBoard();
	const graph = useGraph();

	const node = $derived(board.byPath.get(data.box.path));
	const tile = $derived(tiledAt(data.box, data.depth, graph.lod));
	const counts = $derived(countsOf(board.nodes, data.box.path));
	const inside = $derived(node ? descendantsOf(board.nodes, node.path) : []);
	const progress = $derived(progressOf(inside));
	const unknowns = $derived(counts.questions + counts.assumptions + counts.fog + counts.risks);
	const holdsCurrent = $derived(
		!!board.topic.current &&
			(board.topic.current === data.box.path || board.topic.current.startsWith(`${data.box.path}/`))
	);
	const collapsed = $derived(node ? board.isCollapsed(node) : false);
	const notes = $derived(
		board.notes.filter(
			(n) =>
				n.status !== 'resolved' &&
				n.anchor.path !== null &&
				(n.anchor.path === data.box.path || n.anchor.path.startsWith(`${data.box.path}/`))
		).length
	);

	const beacons = $derived.by(() => {
		const l = graph.layout;
		if (!tile || !l || !node) return [];
		const origin = absoluteBox(l, data.box.id);
		if (!origin) return [];
		const out: { path: string; x: number; y: number; tone: string; current: boolean }[] = [];
		for (const n of inside) {
			if (board.isContainer(n.path)) continue;
			const b = absoluteBox(l, n.path);
			if (!b) continue;
			out.push({
				path: n.path,
				x: ((b.x - origin.x + b.width / 2) / data.box.width) * 100,
				y: ((b.y - origin.y + b.height / 2) / data.box.height) * 100,
				tone: isUnknown(n) || n.kind === 'fog' ? toneOf(n) : 'calm',
				current: board.topic.current === n.path
			});
		}
		return out;
	});

	// Size far-tile type from on-screen width, not zoom alone, or small areas turn illegible.
	const screen = $derived(data.box.width * graph.zoom);
	const fit = (min: number, per: number, max: number) =>
		`${Math.max(min, Math.min(max, screen / per)) / graph.zoom}px`;
	const compact = $derived(graph.lod === 'far' && screen < 150);
	const tiny = $derived(graph.lod === 'far' && screen < 72);

	function toggle(event: MouseEvent) {
		event.stopPropagation();
		if (node) board.setCollapsed(node, !collapsed);
	}
</script>

{#if node}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="group d{Math.min(data.depth, 3)} lod-{graph.lod}"
		class:tile
		class:hot={unknowns > 0}
		class:holds-current={holdsCurrent && tile}
		class:selected={board.selected === node.path}
		class:fresh={board.fresh.has(node.path)}
		class:collapsed={data.box.shape === 'tile'}
		class:compact
		class:tiny
		title={tiny ? node.title : undefined}
		style:width="{data.box.width}px"
		style:height="{data.box.height}px"
		style:--t={graph.lod === 'far' ? fit(compact ? 10 : 12, 13, 22) : null}
		style:--m={graph.lod === 'far' ? fit(11, 22, 15) : null}
		style:--g={graph.lod === 'far' ? fit(11, 26, 15) : null}
		data-path={node.path}
		data-testid="graph-group"
		ondblclick={(e) => {
			e.stopPropagation();
			graph.fit(node.path);
		}}
	>
		<Handle type="target" position={Position.Top} isConnectable={false} class="pw-handle" />
		{#if tile && beacons.length}
			<div class="beacons" aria-hidden="true">
				{#each beacons as b (b.path)}
					<span
						class="beacon t-{b.tone}"
						class:current={b.current}
						style:left="{b.x}%"
						style:top="{b.y}%"
					></span>
				{/each}
			</div>
		{/if}
		<div class="head">
			<Mark kind={node.kind} status={node.status} size={16} />
			<h3 class="title">{node.title}</h3>
			<button
				type="button"
				class="toggle nodrag nopan"
				title={collapsed ? 'Expand' : 'Collapse'}
				aria-label={collapsed ? `Expand ${node.title}` : `Collapse ${node.title}`}
				aria-expanded={!collapsed}
				onclick={toggle}
				ondblclick={(e) => e.stopPropagation()}
			>
				{collapsed ? '+' : '−'}
			</button>
		</div>
		<div class="meta">
			{#if counts.questions}<span class="c q"
					><Mark kind="decision" status="open" size={12} />{counts.questions}</span
				>{/if}
			{#if counts.assumptions}<span class="c a"
					><Mark kind="assumption" status="open" size={12} />{counts.assumptions}</span
				>{/if}
			{#if counts.fog}<span class="c f"
					><Mark kind="fog" status="open" size={12} />{counts.fog}</span
				>{/if}
			{#if counts.risks}<span class="c r"
					><Mark kind="risk" status="open" size={12} />{counts.risks}</span
				>{/if}
			<span class="settled tabular">{counts.settled}/{counts.total} settled</span>
			{#if notes}<span class="notes tabular" title="Open notes inside">{notes}</span>{/if}
		</div>
		{#if tile}
			{#if node.gist}<p class="gist">{node.gist}</p>{/if}
			{#if progress.total}
				<div class="bar" title="{progress.settled} of {progress.total} questions settled">
					<span style:width="{(progress.settled / progress.total) * 100}%"></span>
				</div>
			{/if}
			{#if holdsCurrent}<span class="now">Now asking inside</span>{/if}
		{/if}
		<Handle type="source" position={Position.Bottom} isConnectable={false} class="pw-handle" />
	</div>
{/if}

<style>
	.group {
		position: relative;
		box-sizing: border-box;
		padding: 14px 18px;
		border-radius: 16px;
		border: 1px solid color-mix(in srgb, var(--line) 85%, var(--ink) 15%);
		background: color-mix(in srgb, var(--surface) 38%, transparent);
		color: var(--ink);
	}
	.group.d2 {
		background: color-mix(in srgb, var(--surface-2) 30%, transparent);
		border-radius: 14px;
	}
	.group.d3 {
		background: color-mix(in srgb, var(--surface-2) 45%, transparent);
	}
	.group.hot {
		border-color: color-mix(in srgb, var(--accent) 38%, var(--line));
	}
	.group :global(.pw-handle) {
		opacity: 0;
		pointer-events: none;
		width: 1px;
		height: 1px;
		min-width: 0;
		min-height: 0;
		border: 0;
	}
	.selected {
		outline: 2px solid color-mix(in srgb, var(--ink) 75%, transparent);
		outline-offset: 4px;
	}
	.head {
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 0;
	}
	.title {
		flex: 1;
		min-width: 0;
		margin: 0;
		font-size: 16px;
		font-weight: 680;
		letter-spacing: -0.01em;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.toggle {
		flex: none;
		display: grid;
		place-items: center;
		width: 24px;
		height: 24px;
		border-radius: 6px;
		border: 1px solid var(--line);
		background: var(--surface);
		color: var(--muted);
		font: inherit;
		font-size: 15px;
		line-height: 1;
		cursor: pointer;
	}
	.toggle:hover {
		color: var(--ink);
		border-color: var(--muted);
	}
	.meta {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 10px;
		margin-top: 4px;
		font-size: 12px;
		color: var(--muted);
	}
	.c {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		font-weight: 700;
		color: var(--accent);
	}
	.c.f {
		color: var(--fog);
	}
	.c.r {
		color: var(--risk);
	}
	.notes {
		min-width: 18px;
		padding: 0 6px;
		border-radius: 999px;
		background: var(--accent);
		color: var(--bg);
		font-weight: 700;
		line-height: 18px;
		text-align: center;
	}

	.tile {
		display: flex;
		flex-direction: column;
		gap: 10px;
		background: var(--surface);
		box-shadow: 0 2px 10px -4px rgb(0 0 0 / 0.35);
		overflow: hidden;
	}
	.tile.hot {
		border: 2px solid color-mix(in srgb, var(--accent) 70%, var(--line));
		box-shadow:
			0 0 0 4px var(--glow-soft),
			0 12px 48px -18px var(--glow);
	}
	.tile.holds-current {
		animation: pw-breathe 3.2s var(--ease) infinite;
	}
	.tile .head,
	.tile .meta,
	.tile .gist,
	.tile .bar,
	.tile .now {
		position: relative;
		z-index: 1;
	}
	.tile .title {
		white-space: normal;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
	}
	.gist {
		margin: 0;
		max-width: 40em;
		font-size: 13px;
		line-height: 1.4;
		color: color-mix(in srgb, var(--ink) 78%, var(--muted));
		overflow: hidden;
		display: -webkit-box;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		-webkit-box-orient: vertical;
		text-shadow: 0 0 6px var(--surface);
	}
	.bar {
		width: min(60%, 420px);
		height: 6px;
		border-radius: 999px;
		background: var(--surface-2);
		overflow: hidden;
	}
	.bar span {
		display: block;
		height: 100%;
		background: var(--settled);
	}
	.now {
		align-self: flex-start;
		padding: 2px 10px;
		border-radius: 999px;
		background: var(--accent);
		color: var(--bg);
		font-weight: 700;
		font-size: 12px;
	}
	.beacons {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}
	.beacon {
		position: absolute;
		width: calc(6px / var(--z));
		height: calc(6px / var(--z));
		max-width: 40px;
		max-height: 40px;
		translate: -50% -50%;
		border-radius: 50%;
		background: color-mix(in srgb, var(--muted) 35%, transparent);
	}
	.beacon.t-unknown,
	.beacon.t-assume {
		background: var(--accent);
		box-shadow: 0 0 calc(10px / var(--z)) calc(2px / var(--z)) var(--glow);
	}
	.beacon.t-assume {
		background: transparent;
		border: calc(1.6px / var(--z)) dashed var(--accent);
	}
	.beacon.t-fog {
		background: color-mix(in srgb, var(--fog) 70%, transparent);
		box-shadow: 0 0 calc(14px / var(--z)) calc(4px / var(--z))
			color-mix(in srgb, var(--fog) 35%, transparent);
	}
	.beacon.t-risk {
		background: var(--risk);
		box-shadow: 0 0 calc(10px / var(--z)) calc(2px / var(--z))
			color-mix(in srgb, var(--risk) 50%, transparent);
	}
	.beacon.current {
		animation: pw-breathe 3.2s var(--ease) infinite;
	}
	.fresh::after {
		content: '';
		position: absolute;
		top: 12px;
		right: 50px;
		width: calc(8px / min(var(--z), 1));
		height: calc(8px / min(var(--z), 1));
		border-radius: 50%;
		background: var(--ink);
		box-shadow: 0 0 10px 2px var(--fresh);
	}

	.lod-mid .title {
		font-size: clamp(16px, calc(14px / var(--z)), 26px);
	}
	.lod-mid .meta {
		font-size: clamp(12px, calc(9px / var(--z)), 16px);
	}
	.lod-mid .toggle {
		width: clamp(24px, calc(16px / var(--z)), 32px);
		height: clamp(24px, calc(16px / var(--z)), 32px);
		font-size: clamp(15px, calc(11px / var(--z)), 22px);
	}
	.lod-far.tile {
		padding: calc(var(--m) * 1.1);
		gap: calc(var(--m) * 0.7);
		border-radius: calc(var(--m) * 1.1);
	}
	.lod-far .head {
		gap: calc(var(--t) * 0.4);
		font-size: var(--t);
	}
	.lod-far .title {
		font-size: var(--t);
		line-height: 1.14;
		-webkit-line-clamp: 3;
		line-clamp: 3;
	}
	.lod-far .meta {
		gap: calc(var(--m) * 0.8);
		font-size: var(--m);
	}
	.lod-far .meta :global(svg.mark),
	.lod-mid .meta :global(svg.mark) {
		width: 1em;
		height: 1em;
	}
	.lod-far .head :global(svg.mark) {
		width: 0.9em;
		height: 0.9em;
	}
	.lod-far .gist {
		font-size: var(--g);
	}
	.lod-far .bar {
		height: calc(var(--m) * 0.45);
	}
	.lod-far .now,
	.lod-far .notes {
		font-size: var(--m);
		line-height: 1.5;
	}
	.lod-far .toggle {
		width: calc(var(--m) * 1.7);
		height: calc(var(--m) * 1.7);
		font-size: var(--m);
	}
	.compact.tile {
		padding: calc(var(--m) * 0.6);
	}
	.compact .title {
		overflow-wrap: break-word;
		hyphens: auto;
	}
	.compact .head :global(svg.mark) {
		display: none;
	}
	.tiny .title {
		display: none;
	}
	.tiny .head :global(svg.mark) {
		display: inline-block;
	}
	.compact .gist,
	.compact .bar,
	.compact .now,
	.compact .settled,
	.compact .toggle {
		display: none;
	}
	.lod-far.tile.hot {
		border-width: calc(2px / var(--z));
	}
</style>
