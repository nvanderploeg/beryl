<script lang="ts">
	import { useBoard } from '#lib/ui/board.svelte.ts';
	import {
		PANELS,
		ZONE_MIN,
		defaultSize,
		moveToZone,
		reveal,
		setCollapsed,
		setZoneSize,
		shiftDivider,
		type Dock,
		type Layout
	} from '#lib/ui/layout.ts';
	import DockGroup from './DockGroup.svelte';
	import Splitter from './Splitter.svelte';

	let { dock, room }: { dock: Dock; room: number } = $props();

	const RAIL = 36;

	const board = useBoard();

	const zone = $derived(board.layout[dock]);
	const vertical = $derived(dock === 'bottom');
	const label = (id: string) => PANELS.find((p) => p.id === id)!.label;
	const panels = $derived(zone.groups.flatMap((g) => g.panels));
	const size = $derived(Math.min(zone.size, Math.max(ZONE_MIN[dock], room)));

	let stack: HTMLElement | undefined = $state();
	let base: Layout = board.layout;

	function startZone() {
		base = board.layout;
	}

	function moveZone(delta: number) {
		// Left grows rightwards; right and bottom grow towards the cursor's opposite side.
		const grown = dock === 'left' ? delta : -delta;
		const next = Math.min(Math.max(ZONE_MIN[dock], base[dock].size + grown), room);
		board.setLayout(setZoneSize(base, dock, next));
	}

	function moveDivider(index: number, delta: number) {
		const extent = vertical ? stack?.clientWidth : stack?.clientHeight;
		if (!extent) return;
		const total = base[dock].groups.reduce((sum, g) => sum + g.weight, 0);
		board.setLayout(shiftDivider(base, dock, index, (delta / extent) * total));
	}

	function dropOnEdge(event: DragEvent) {
		const panel = board.dragging;
		board.dragging = null;
		if (!panel) return;
		event.preventDefault();
		board.setLayout(moveToZone(board.layout, panel, dock));
	}
</script>

{#snippet resizer()}
	<Splitter
		axis={vertical ? 'y' : 'x'}
		label="Resize {dock} dock"
		onstart={startZone}
		onmove={moveZone}
		onreset={() => board.setLayout(setZoneSize(board.layout, dock, defaultSize(dock)))}
	/>
{/snippet}

{#if zone.groups.length}
	{#if dock !== 'left' && !zone.collapsed}{@render resizer()}{/if}
	{#if zone.collapsed}
		<div
			class="rail {dock}"
			role="toolbar"
			aria-label="{dock} dock"
			data-testid="dock-rail-{dock}"
			style:flex="0 0 {RAIL}px"
		>
			<button
				type="button"
				class="expand"
				aria-label="Expand {dock} dock"
				onclick={() => board.setLayout(setCollapsed(board.layout, dock, false))}
			>
				<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
					<path
						d={dock === 'left'
							? 'M6 3.5 10.5 8 6 12.5'
							: dock === 'right'
								? 'M10 3.5 5.5 8l4.5 4.5'
								: 'M3.5 10 8 5.5l4.5 4.5'}
						fill="none"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
			</button>
			{#each panels as panel (panel)}
				<button
					type="button"
					class="rail-tab"
					data-testid="rail-{panel}"
					onclick={() => board.setLayout(reveal(board.layout, panel))}>{label(panel)}</button
				>
			{/each}
		</div>
	{:else}
		<div class="zone {dock}" data-testid="dock-{dock}" style:flex="0 0 {size}px">
			<div class="stack" class:row={vertical} bind:this={stack}>
				{#each zone.groups as group, i (group.id)}
					{#if i > 0}
						<Splitter
							axis={vertical ? 'x' : 'y'}
							label="Resize {label(zone.groups[i - 1].active)} and {label(group.active)}"
							onstart={startZone}
							onmove={(d) => moveDivider(i - 1, d)}
						/>
					{/if}
					<div class="slot" style:flex="{group.weight} 1 0">
						<DockGroup
							{dock}
							{group}
							onactivate={(panel) => board.setLayout(reveal(board.layout, panel))}
						/>
					</div>
				{/each}
			</div>
		</div>
	{/if}
	{#if dock === 'left' && !zone.collapsed}{@render resizer()}{/if}
{/if}

{#if board.dragging}
	<div
		class="edge {dock}"
		class:empty={!zone.groups.length}
		role="presentation"
		data-testid="edge-{dock}"
		ondragover={(e) => e.preventDefault()}
		ondrop={dropOnEdge}
	>
		<span>Dock {dock}</span>
	</div>
{/if}

<style>
	.zone {
		min-width: 0;
		min-height: 0;
		display: flex;
		overflow: hidden;
	}
	.stack {
		flex: 1;
		min-width: 0;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}
	.stack.row {
		flex-direction: row;
	}
	.slot {
		min-width: 0;
		min-height: 0;
		display: flex;
	}
	.rail {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.4rem 0;
		background: var(--surface);
		overflow: hidden;
	}
	.rail.left,
	.rail.right {
		flex-direction: column;
	}
	.rail.left {
		border-right: 1px solid var(--line);
	}
	.rail.right {
		border-left: 1px solid var(--line);
	}
	.rail.bottom {
		flex-direction: row;
		padding: 0 0.5rem;
		border-top: 1px solid var(--line);
	}
	.rail button {
		border: 0;
		background: none;
		color: var(--muted);
		font: inherit;
		cursor: pointer;
	}
	.rail button:hover {
		color: var(--ink);
	}
	.rail-tab {
		font-size: 0.78rem;
		font-weight: 600;
	}
	.rail.left .rail-tab,
	.rail.right .rail-tab {
		writing-mode: vertical-rl;
	}
	.edge {
		position: fixed;
		z-index: 45;
		display: flex;
		align-items: center;
		justify-content: center;
		background: color-mix(in srgb, var(--accent) 16%, transparent);
		border: 2px dashed var(--accent);
		color: var(--ink);
		font-size: 0.78rem;
		font-weight: 600;
	}
	.edge.left,
	.edge.right {
		top: 30%;
		bottom: 30%;
		width: 44px;
	}
	.edge.left {
		left: 0;
	}
	.edge.right {
		right: 0;
	}
	.edge.left span,
	.edge.right span {
		writing-mode: vertical-rl;
	}
	.edge.bottom {
		left: 30%;
		right: 30%;
		bottom: 0;
		height: 40px;
	}
</style>
