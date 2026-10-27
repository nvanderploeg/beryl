<script lang="ts">
	import { onMount, untrack, type Snippet } from 'svelte';
	import { goto } from '$app/navigation';
	import { fly } from 'svelte/transition';
	import { provideBoard, type Board } from '#lib/ui/board.svelte.ts';
	import { STAGE_MIN, ZONE_MIN, narrowLayout, type PanelId } from '#lib/ui/layout.ts';
	import { theme } from '#lib/ui/theme.svelte.ts';
	import BoardHeader from './BoardHeader.svelte';
	import SiteFooter from './SiteFooter.svelte';
	import Dock from './dock/Dock.svelte';
	import DockGroup from './dock/DockGroup.svelte';
	import DockPanel from './dock/DockPanel.svelte';
	import Mark from './Mark.svelte';
	import GraphView from './graph/GraphView.svelte';
	import MapView from './MapView.svelte';
	import OutlineView from './OutlineView.svelte';
	import FrontierView from './FrontierView.svelte';

	let { board, top, bottom }: { board: Board; top?: Snippet; bottom?: Snippet } = $props();

	// svelte-ignore state_referenced_locally
	provideBoard(board);

	let bodyW = $state(0);
	let bodyH = $state(0);
	let sheetTab: PanelId = $state('details');

	const sheetGroup = $derived({ ...narrowLayout().right.groups[0], active: sheetTab });
	const isCurrent = $derived(
		!!board.selectedNode && board.topic.current === board.selectedNode.path
	);

	function sideRoom(dock: 'left' | 'right'): number {
		const other = board.layout[dock === 'left' ? 'right' : 'left'];
		const taken = other.groups.length ? (other.collapsed ? 36 : other.size) : 0;
		return Math.max(ZONE_MIN[dock], bodyW - STAGE_MIN - taken);
	}

	const bottomRoom = $derived(Math.max(ZONE_MIN.bottom, bodyH - 200));

	onMount(() => {
		theme.start();
		return board.start();
	});

	$effect(() => {
		const view = board.view;
		const node = board.selected;
		untrack(() => {
			const url = new URL(location.href);
			if (view === 'graph') url.searchParams.delete('view');
			else url.searchParams.set('view', view);
			if (node === null) url.searchParams.delete('node');
			else url.searchParams.set('node', node);
			if (url.href === location.href) return;
			// eslint-disable-next-line svelte/no-navigation-without-resolve -- same page, query only
			void goto(url, { replace: true, shallow: true, state: {} });
		});
	});

	function keydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			if (board.drawerOpen) board.drawerOpen = false;
			else if (board.sheetOpen) board.sheetOpen = false;
		}
	}
</script>

{#snippet stage()}
	{#if board.view === 'graph'}
		<GraphView />
	{:else if board.view === 'map'}
		<MapView />
	{:else if board.view === 'outline'}
		<OutlineView />
	{:else}
		<FrontierView />
	{/if}
{/snippet}

<svelte:window onkeydown={keydown} />

<div class="board" data-testid="board" data-view={board.view}>
	{@render top?.()}
	<BoardHeader />
	{#if board.narrow}
		<div class="body narrow">
			<aside
				class="drawer"
				class:open={board.drawerOpen}
				aria-label="Questions"
				data-testid="questions-sidebar"
			>
				<DockPanel id="questions" />
			</aside>
			{#if board.drawerOpen}
				<button
					type="button"
					class="scrim"
					aria-label="Close questions"
					onclick={() => (board.drawerOpen = false)}
				></button>
			{/if}
			<main class="stage" aria-label="{board.view} view">
				{@render stage()}
			</main>
			<aside
				class="sheet"
				class:open={board.sheetOpen}
				aria-label="Inspector"
				data-testid="inspector"
			>
				<button
					type="button"
					class="handle"
					aria-expanded={board.sheetOpen}
					onclick={() => (board.sheetOpen = !board.sheetOpen)}
				>
					<span class="grip"></span>
					<span class="handle-title">
						{#if board.selectedNode}
							<Mark
								kind={board.selectedNode.kind}
								status={board.selectedNode.status}
								size={14}
								current={isCurrent}
							/>
							{board.selectedNode.title}
						{:else}
							{board.topic.title}
						{/if}
					</span>
				</button>
				<DockGroup dock="right" group={sheetGroup} fixed onactivate={(p) => (sheetTab = p)} />
			</aside>
		</div>
	{:else}
		<div class="body" bind:clientWidth={bodyW} bind:clientHeight={bodyH}>
			<div class="row">
				<Dock dock="left" room={sideRoom('left')} />
				<main class="stage" aria-label="{board.view} view">
					{@render stage()}
				</main>
				<Dock dock="right" room={sideRoom('right')} />
			</div>
			<Dock dock="bottom" room={bottomRoom} />
		</div>
	{/if}
	{@render bottom?.()}
	<footer class="foot"><SiteFooter /></footer>
	{#if board.toast}
		{#key board.toast.n}
			<div
				class="toast"
				class:error={board.toast.tone === 'error'}
				role="status"
				data-testid="toast"
				transition:fly={{ y: 12, duration: 180 }}
			>
				{board.toast.text}
			</div>
		{/key}
	{/if}
</div>

<style>
	.board {
		height: 100dvh;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		background: var(--bg);
	}
	.body {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}
	.row {
		flex: 1;
		min-height: 0;
		display: flex;
	}
	.stage {
		position: relative;
		flex: 1;
		min-width: 0;
		min-height: 0;
		overflow: hidden;
	}
	.foot {
		flex: none;
		padding: 0.4rem 1rem;
		border-top: 1px solid var(--line);
		background: var(--surface);
	}
	.toast {
		position: fixed;
		left: 50%;
		bottom: 1.5rem;
		translate: -50% 0;
		z-index: 60;
		max-width: min(32rem, calc(100vw - 2rem));
		padding: 0.6rem 1rem;
		border-radius: 10px;
		border: 1px solid var(--line);
		background: var(--surface-2);
		color: var(--ink);
		font-size: 0.875rem;
		box-shadow: var(--shadow-pop);
	}
	.toast.error {
		border-color: color-mix(in srgb, var(--removed) 60%, var(--line));
	}

	.drawer {
		position: fixed;
		z-index: 40;
		inset: 0 auto 0 0;
		width: min(340px, 88vw);
		background: var(--surface);
		translate: -102% 0;
		transition: translate 220ms var(--ease);
		box-shadow: var(--shadow-pop);
		overflow: hidden;
	}
	.drawer.open {
		translate: 0 0;
	}
	.scrim {
		position: fixed;
		inset: 0;
		z-index: 39;
		border: 0;
		background: rgb(0 0 0 / 0.38);
	}
	.sheet {
		position: fixed;
		z-index: 30;
		left: 0;
		right: 0;
		bottom: 0;
		height: min(64dvh, 640px);
		display: flex;
		flex-direction: column;
		background: var(--surface);
		border-top: 1px solid var(--line);
		border-radius: 16px 16px 0 0;
		box-shadow: 0 -12px 32px -16px rgb(0 0 0 / 0.5);
		overflow: hidden;
		translate: 0 calc(100% - 56px);
		transition: translate 240ms var(--ease);
	}
	.sheet.open {
		translate: 0 0;
	}
	.handle {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.35rem;
		flex: none;
		height: 56px;
		padding: 0.4rem 1rem 0;
		border: 0;
		border-bottom: 1px solid var(--line);
		background: none;
		color: var(--ink);
		font: inherit;
		cursor: pointer;
	}
	.grip {
		width: 36px;
		height: 4px;
		border-radius: 2px;
		background: var(--line);
	}
	.handle-title {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		max-width: 100%;
		font-size: 0.9rem;
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
