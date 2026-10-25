<script lang="ts">
	import { onMount } from 'svelte';
	import { openNoteCounts } from '#lib/ui/index.ts';
	import { useBoard } from '#lib/ui/board.svelte.ts';
	import { toneOf } from '#lib/ui/kinds.ts';
	import { ancestorsOf, countsOf, isUnknown, pendingAnswer } from '#lib/ui/topic.ts';
	import { LABEL_H, treemapCells, type Cell } from '#lib/ui/treemap.ts';
	import Mark from './Mark.svelte';

	const board = useBoard();

	let width = $state(0);
	let height = $state(0);
	let focus: string | null = $state(null);
	let pulse: { path: string; n: number } | null = $state(null);

	const focusNode = $derived(focus === null ? null : (board.byPath.get(focus) ?? null));
	$effect(() => {
		if (focus !== null && !focusNode) focus = null;
	});

	const cells: Cell[] = $derived(treemapCells(board.nodes, focusNode?.path ?? null, width, height));
	const crumbs = $derived(
		focusNode
			? [...ancestorsOf(focusNode.path), focusNode.path].map((p) => ({
					path: p,
					title: board.byPath.get(p)?.title ?? p
				}))
			: []
	);
	const unresolved = $derived(openNoteCounts(board.notes));

	function show(path: string, animate: boolean) {
		const node = board.byPath.get(path);
		if (!node) return;
		focus = node.parentPath;
		if (animate) pulse = { path, n: (pulse?.n ?? 0) + 1 };
	}

	let lastFlight = board.flight?.n ?? 0;
	$effect(() => {
		const flight = board.flight;
		if (!flight || flight.n === lastFlight) return;
		lastFlight = flight.n;
		show(flight.path, true);
	});

	onMount(() => {
		if (board.selected) show(board.selected, false);
	});

	function click(cell: Cell) {
		if (cell.container) focus = cell.path;
		else board.select(cell.path);
	}

	function size(cell: Cell): 'xs' | 's' | 'm' | 'l' {
		const area = cell.width * cell.height;
		if (cell.width < 54 || cell.height < 26) return 'xs';
		if (area < 12_000 || cell.height < 54) return 's';
		if (area < 40_000) return 'm';
		return 'l';
	}
</script>

<div class="map" data-testid="map-view">
	<nav class="crumbs" aria-label="Map path">
		<button type="button" class:here={focus === null} onclick={() => (focus = null)}
			>{board.topic.title}</button
		>
		{#each crumbs as c (c.path)}
			<span class="slash">/</span>
			<button type="button" class:here={c.path === focus} onclick={() => (focus = c.path)}
				>{c.title}</button
			>
		{/each}
		<span class="legend" aria-hidden="true">
			<span class="sw unknown"></span>open
			<span class="sw fog"></span>fog
			<span class="sw settled"></span>settled
			<span class="sw parked"></span>parked
		</span>
	</nav>
	<div class="canvas" bind:clientWidth={width} bind:clientHeight={height}>
		{#each cells as cell (cell.path)}
			{@const n = cell.node}
			{@const s = size(cell)}
			{@const counts = cell.container ? countsOf(board.nodes, n.path) : null}
			{@const unknowns = counts
				? counts.questions + counts.assumptions + counts.fog + counts.risks
				: 0}
			{@const notes = unresolved.get(n.path) ?? 0}
			{@const current = board.topic.current === n.path}
			<button
				type="button"
				class="cell tone-{toneOf(n)} size-{s} d{cell.depth}"
				class:container={cell.container}
				class:hot={cell.container && unknowns > 0}
				class:selected={board.selected === n.path}
				class:fresh={board.fresh.has(n.path)}
				class:current
				class:pulse={pulse?.path === n.path}
				style:left="{cell.x}px"
				style:top="{cell.y}px"
				style:width="{cell.width}px"
				style:height="{cell.height}px"
				style:--label-h="{LABEL_H}px"
				data-path={n.path}
				data-testid="map-cell"
				title="{n.title}{n.gist ? `: ${n.gist}` : ''}"
				onclick={(e) => {
					e.stopPropagation();
					click(cell);
				}}
				ondblclick={() => {
					if (!cell.container) focus = n.parentPath;
				}}
			>
				{#key pulse?.path === n.path ? pulse?.n : 0}
					<span class="ring"></span>
				{/key}
				{#if s !== 'xs'}
					<span class="label">
						<Mark kind={n.kind} status={n.status} size={s === 'l' ? 15 : 13} {current} />
						<span class="title">{n.title}</span>
						{#if counts && s !== 's'}
							<span class="counts tabular">
								{#if unknowns}<span class="u">{unknowns} open</span>{/if}
								<span>{counts.settled}/{counts.total}</span>
							</span>
						{/if}
						{#if notes || pendingAnswer(board.notes, n.path)}<span class="dot" title="Notes waiting"
							></span>{/if}
					</span>
					{#if !cell.container && (s === 'm' || s === 'l') && n.gist}
						<span class="gist">{n.gist}</span>
					{/if}
					{#if !cell.container && s === 'l' && (n.answer || n.recommendation)}
						<span class="says" class:answer={!!n.answer}>
							<b>{n.answer ? 'Answer' : 'Recommendation'}</b>{n.answer || n.recommendation}
						</span>
					{/if}
				{:else if isUnknown(n)}
					<span class="spark"></span>
				{/if}
			</button>
		{:else}
			<p class="empty">Nothing to map yet.</p>
		{/each}
	</div>
</div>

<style>
	.map {
		height: 100%;
		display: flex;
		flex-direction: column;
		padding: 0.75rem;
		gap: 0.6rem;
	}
	.crumbs {
		display: flex;
		align-items: baseline;
		flex-wrap: wrap;
		gap: 0.3rem;
		font-size: 0.84rem;
	}
	.crumbs button {
		padding: 0.1rem 0.2rem;
		border: 0;
		border-radius: 5px;
		background: none;
		color: var(--muted);
		font: inherit;
		cursor: pointer;
	}
	.crumbs button:hover {
		color: var(--ink);
	}
	.crumbs button.here {
		color: var(--ink);
		font-weight: 650;
	}
	.slash {
		color: color-mix(in srgb, var(--muted) 60%, transparent);
	}
	.legend {
		margin-left: auto;
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		font-size: 0.74rem;
		color: var(--muted);
	}
	.sw {
		width: 10px;
		height: 10px;
		border-radius: 3px;
		margin-left: 0.4rem;
	}
	.sw.unknown {
		background: color-mix(in srgb, var(--accent) 45%, var(--surface));
		border: 1px solid var(--accent);
	}
	.sw.fog {
		background: var(--hatch-fog), color-mix(in srgb, var(--fog) 15%, var(--surface));
		border: 1px solid var(--fog);
	}
	.sw.settled {
		background: color-mix(in srgb, var(--settled) 18%, var(--surface));
	}
	.sw.parked {
		background: var(--surface-2);
	}
	.canvas {
		position: relative;
		flex: 1;
		min-height: 0;
	}
	.cell {
		position: absolute;
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: 0.2rem;
		padding: 0.35rem 0.45rem;
		overflow: hidden;
		border-radius: 7px;
		border: 1px solid var(--line);
		background: var(--surface);
		color: var(--ink);
		font: inherit;
		text-align: left;
		cursor: pointer;
		transition:
			left 380ms var(--ease),
			top 380ms var(--ease),
			width 380ms var(--ease),
			height 380ms var(--ease),
			background-color 200ms,
			border-color 200ms;
	}
	.cell.container {
		padding: 0 0.45rem;
		background: color-mix(in srgb, var(--surface) 55%, transparent);
		border-color: color-mix(in srgb, var(--line) 85%, var(--ink) 15%);
	}
	.cell.container.d2 {
		background: color-mix(in srgb, var(--surface-2) 45%, transparent);
	}
	.cell.container.hot {
		border-color: color-mix(in srgb, var(--accent) 40%, var(--line));
	}
	.cell.container > .label {
		height: var(--label-h);
		flex: none;
	}
	.cell:hover {
		border-color: color-mix(in srgb, var(--ink) 40%, var(--line));
	}
	.cell.tone-unknown:not(.container) {
		background: color-mix(in srgb, var(--accent) 20%, var(--surface));
		border-color: var(--accent);
		box-shadow: inset 0 0 28px -6px var(--glow);
	}
	.cell.tone-assume:not(.container) {
		background: color-mix(in srgb, var(--accent) 12%, var(--surface));
		border: 1.5px dashed var(--accent);
	}
	.cell.tone-risk:not(.container) {
		background: color-mix(in srgb, var(--risk) 22%, var(--surface));
		border-color: var(--risk);
	}
	.cell.tone-fog:not(.container) {
		background: var(--hatch-fog), color-mix(in srgb, var(--fog) 14%, var(--surface));
		border-color: color-mix(in srgb, var(--fog) 70%, transparent);
	}
	.cell.tone-settled:not(.container),
	.cell.tone-quiet:not(.container) {
		background: color-mix(in srgb, var(--settled) 9%, var(--surface));
		color: color-mix(in srgb, var(--ink) 70%, var(--muted));
	}
	.cell.tone-parked:not(.container) {
		background: var(--surface-2);
		color: var(--muted);
	}
	.cell.tone-dropped:not(.container) {
		background: transparent;
		border-style: dotted;
		color: var(--muted);
		opacity: 0.65;
	}
	.cell.tone-dropped .title {
		text-decoration: line-through;
	}
	.cell.selected {
		outline: 2px solid var(--ink);
		outline-offset: -2px;
		z-index: 2;
	}
	.cell.current {
		animation: pw-breathe 3.2s var(--ease) infinite;
		z-index: 1;
	}
	.cell.fresh::after {
		content: '';
		position: absolute;
		top: 6px;
		right: 6px;
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--ink);
		box-shadow: 0 0 8px var(--fresh);
	}
	.ring {
		position: absolute;
		inset: 0;
		border-radius: inherit;
		pointer-events: none;
	}
	.pulse .ring {
		animation: pw-pulse 900ms var(--ease) 2;
	}
	.label {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		min-width: 0;
	}
	.title {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 0.8rem;
		font-weight: 600;
	}
	.size-l .title {
		font-size: 0.9rem;
	}
	.container > .label .title {
		font-size: 0.78rem;
		font-weight: 650;
	}
	.d1.container > .label .title {
		font-size: 0.86rem;
	}
	.counts {
		margin-left: auto;
		display: inline-flex;
		gap: 0.45rem;
		flex: none;
		font-size: 0.72rem;
		color: var(--muted);
	}
	.counts .u {
		color: var(--accent);
		font-weight: 650;
	}
	.dot {
		flex: none;
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--accent);
	}
	.gist {
		font-size: 0.76rem;
		line-height: 1.35;
		color: inherit;
		opacity: 0.85;
		overflow: hidden;
		display: -webkit-box;
		-webkit-line-clamp: 4;
		line-clamp: 4;
		-webkit-box-orient: vertical;
	}
	.says {
		margin-top: 0.25rem;
		padding-left: 0.5rem;
		border-left: 2px solid var(--accent);
		font-size: 0.78rem;
		line-height: 1.4;
		overflow: hidden;
		display: -webkit-box;
		-webkit-line-clamp: 5;
		line-clamp: 5;
		-webkit-box-orient: vertical;
	}
	.says.answer {
		border-left-color: var(--settled);
	}
	.says b {
		display: block;
		font-size: 0.68rem;
		font-weight: 650;
		color: var(--accent);
	}
	.says.answer b {
		color: var(--settled);
	}
	.size-l .gist {
		font-size: 0.84rem;
	}
	.spark {
		width: 6px;
		height: 6px;
		margin: auto;
		border-radius: 50%;
		background: var(--accent);
		box-shadow: 0 0 6px var(--glow);
	}
	.empty {
		margin: 2rem;
		color: var(--muted);
	}
</style>
