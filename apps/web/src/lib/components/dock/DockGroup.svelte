<script lang="ts">
	import { useBoard } from '#lib/ui/board.svelte.ts';
	import {
		DOCKS,
		PANELS,
		moveToTabs,
		moveToZone,
		setCollapsed,
		type Dock,
		type Group,
		type PanelId
	} from '#lib/ui/layout.ts';
	import DockPanel from './DockPanel.svelte';

	let {
		dock,
		group,
		fixed = false,
		onactivate
	}: {
		dock: Dock;
		group: Group;
		/** Tabs switch but nothing drags or moves. */
		fixed?: boolean;
		onactivate: (panel: PanelId) => void;
	} = $props();

	const board = useBoard();

	const label = (id: PanelId) => PANELS.find((p) => p.id === id)!.label;
	// Stacks run top to bottom in the side docks and left to right in the bottom dock.
	const along = $derived(dock === 'bottom' ? 'x' : 'y');

	let menu = $state(false);
	let over = $state<'before' | 'tabs' | 'after' | null>(null);
	let visited = $state<PanelId[]>([]);

	// A panel stays mounted once shown so a half-typed note survives tab switches.
	$effect(() => {
		if (!visited.includes(group.active)) visited = [...visited, group.active];
	});

	function dragstart(event: DragEvent, panel: PanelId) {
		event.dataTransfer?.setData('text/plain', panel);
		if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
		board.dragging = panel;
	}

	function dragend() {
		board.dragging = null;
		over = null;
	}

	function allow(event: DragEvent, zone: 'before' | 'tabs' | 'after') {
		if (!board.dragging) return;
		event.preventDefault();
		over = zone;
	}

	function drop(event: DragEvent, zone: 'before' | 'tabs' | 'after', beforePanel?: PanelId) {
		const panel = board.dragging;
		over = null;
		board.dragging = null;
		if (!panel) return;
		event.preventDefault();
		event.stopPropagation();
		const peers = board.layout[dock].groups;
		const at = peers.findIndex((g) => g.id === group.id);
		if (zone === 'tabs') {
			board.setLayout(moveToTabs(board.layout, panel, group.id, beforePanel));
		} else if (zone === 'before') {
			board.setLayout(moveToZone(board.layout, panel, dock, group.id));
		} else {
			board.setLayout(moveToZone(board.layout, panel, dock, peers[at + 1]?.id));
		}
	}

	function moveTo(target: Dock) {
		menu = false;
		board.dockPanel(group.active, target);
	}
</script>

<svelte:window
	onpointerdown={(e) => {
		if (menu && !(e.target as Element).closest('.menu-wrap')) menu = false;
	}}
	onkeydown={(e) => {
		if (e.key === 'Escape') menu = false;
	}}
/>

<section class="group" data-testid="dock-group" data-panels={group.panels.join(' ')}>
	<header
		class="strip"
		role="presentation"
		class:over={over === 'tabs'}
		ondragover={(e) => !fixed && allow(e, 'tabs')}
		ondragleave={() => (over = null)}
		ondrop={(e) => !fixed && drop(e, 'tabs')}
	>
		<div class="tabs" role="tablist">
			{#each group.panels as panel (panel)}
				<button
					type="button"
					role="tab"
					class="tab"
					aria-selected={group.active === panel}
					data-testid="dock-tab-{panel}"
					draggable={!fixed}
					ondragstart={(e) => dragstart(e, panel)}
					ondragend={dragend}
					ondragover={(e) => !fixed && allow(e, 'tabs')}
					ondrop={(e) => !fixed && drop(e, 'tabs', panel)}
					onclick={() => onactivate(panel)}>{label(panel)}</button
				>
			{/each}
		</div>
		{#if !fixed}
			<div class="menu-wrap">
				<button
					type="button"
					class="more"
					aria-label="Panel layout"
					aria-haspopup="menu"
					aria-expanded={menu}
					data-testid="dock-menu"
					onclick={() => (menu = !menu)}
				>
					<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
						<circle cx="3.5" cy="8" r="1.2" fill="currentColor" />
						<circle cx="8" cy="8" r="1.2" fill="currentColor" />
						<circle cx="12.5" cy="8" r="1.2" fill="currentColor" />
					</svg>
				</button>
				{#if menu}
					<div class="menu" role="menu">
						<span class="menu-head">Move {label(group.active)} to</span>
						{#each DOCKS as target (target)}
							<button
								type="button"
								role="menuitem"
								disabled={target === dock && group.panels.length === 1}
								data-testid="dock-to-{target}"
								onclick={() => moveTo(target)}
							>
								{target === 'left' ? 'Left' : target === 'right' ? 'Right' : 'Bottom'} dock
							</button>
						{/each}
						<hr />
						<button
							type="button"
							role="menuitem"
							onclick={() => {
								menu = false;
								board.setLayout(setCollapsed(board.layout, dock, true));
							}}>Collapse this dock</button
						>
						<button
							type="button"
							role="menuitem"
							data-testid="dock-reset"
							onclick={() => {
								menu = false;
								board.resetLayout();
							}}>Reset layout</button
						>
					</div>
				{/if}
			</div>
		{/if}
	</header>

	<div class="content">
		{#each group.panels as panel (panel)}
			{#if visited.includes(panel) || group.active === panel}
				<div class="panel" hidden={group.active !== panel} data-panel={panel}>
					<DockPanel id={panel} />
				</div>
			{/if}
		{/each}

		{#if board.dragging && !fixed}
			<div class="targets {along}">
				<div
					class="target before"
					class:over={over === 'before'}
					role="presentation"
					ondragover={(e) => allow(e, 'before')}
					ondragleave={() => (over = null)}
					ondrop={(e) => drop(e, 'before')}
				></div>
				<div
					class="target tabs-t"
					class:over={over === 'tabs'}
					role="presentation"
					ondragover={(e) => allow(e, 'tabs')}
					ondragleave={() => (over = null)}
					ondrop={(e) => drop(e, 'tabs')}
				></div>
				<div
					class="target after"
					class:over={over === 'after'}
					role="presentation"
					ondragover={(e) => allow(e, 'after')}
					ondragleave={() => (over = null)}
					ondrop={(e) => drop(e, 'after')}
				></div>
			</div>
		{/if}
	</div>
</section>

<style>
	.group {
		flex: 1 1 0;
		min-width: 0;
		min-height: 0;
		display: flex;
		flex-direction: column;
		background: var(--surface);
	}
	.strip {
		flex: none;
		display: flex;
		align-items: stretch;
		border-bottom: 1px solid var(--line);
		background: var(--surface-2);
	}
	.strip.over {
		box-shadow: inset 0 -2px 0 var(--accent);
	}
	.tabs {
		flex: 1;
		min-width: 0;
		display: flex;
		overflow-x: auto;
		scrollbar-width: none;
	}
	.tab {
		flex: none;
		padding: 0.45rem 0.8rem;
		border: 0;
		border-bottom: 2px solid transparent;
		background: none;
		color: var(--muted);
		font: inherit;
		font-size: 0.82rem;
		font-weight: 600;
		cursor: grab;
	}
	.tab[aria-selected='true'] {
		color: var(--ink);
		border-bottom-color: var(--accent);
	}
	.tab:hover {
		color: var(--ink);
	}
	.menu-wrap {
		position: relative;
		flex: none;
	}
	.more {
		height: 100%;
		padding: 0 0.5rem;
		border: 0;
		background: none;
		color: var(--muted);
		cursor: pointer;
	}
	.more:hover,
	.more[aria-expanded='true'] {
		color: var(--ink);
	}
	.menu {
		position: absolute;
		right: 0.3rem;
		top: calc(100% + 2px);
		z-index: 50;
		min-width: 12rem;
		display: flex;
		flex-direction: column;
		padding: 0.3rem;
		border: 1px solid var(--line);
		border-radius: 10px;
		background: var(--surface-2);
		box-shadow: var(--shadow-pop);
	}
	.menu-head {
		padding: 0.25rem 0.5rem;
		font-size: 0.7rem;
		font-weight: 650;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--muted);
	}
	.menu button {
		padding: 0.4rem 0.5rem;
		border: 0;
		border-radius: 6px;
		background: none;
		color: var(--ink);
		font: inherit;
		font-size: 0.84rem;
		text-align: left;
		cursor: pointer;
	}
	.menu button:hover:not(:disabled) {
		background: color-mix(in srgb, var(--accent) 14%, transparent);
	}
	.menu button:disabled {
		color: var(--muted);
		cursor: default;
	}
	.menu hr {
		width: 100%;
		margin: 0.25rem 0;
		border: 0;
		border-top: 1px solid var(--line);
	}
	.content {
		position: relative;
		flex: 1;
		min-height: 0;
		overflow: hidden;
	}
	.panel {
		height: 100%;
	}
	.panel[hidden] {
		display: none;
	}
	.targets {
		position: absolute;
		inset: 0;
		z-index: 20;
		display: flex;
	}
	.targets.y {
		flex-direction: column;
	}
	.target {
		background: color-mix(in srgb, var(--bg) 40%, transparent);
	}
	.before,
	.after {
		flex: 1;
	}
	.tabs-t {
		flex: 2;
	}
	.target.over {
		background: color-mix(in srgb, var(--accent) 28%, transparent);
		outline: 2px solid var(--accent);
		outline-offset: -2px;
	}
</style>
