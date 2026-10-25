<script lang="ts">
	import { onMount, untrack, type Snippet } from 'svelte';
	import { goto } from '$app/navigation';
	import { fly } from 'svelte/transition';
	import { provideBoard, type Board } from '#lib/ui/board.svelte.ts';
	import { theme } from '#lib/ui/theme.svelte.ts';
	import BoardHeader from './BoardHeader.svelte';
	import QuestionsSidebar from './QuestionsSidebar.svelte';
	import Inspector from './Inspector.svelte';
	import GraphView from './graph/GraphView.svelte';
	import MapView from './MapView.svelte';
	import OutlineView from './OutlineView.svelte';
	import FrontierView from './FrontierView.svelte';

	let { board, top, bottom }: { board: Board; top?: Snippet; bottom?: Snippet } = $props();

	// svelte-ignore state_referenced_locally
	provideBoard(board);

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

<svelte:window onkeydown={keydown} />

<div class="board" class:rail={!board.sidebarOpen} data-testid="board" data-view={board.view}>
	{@render top?.()}
	<BoardHeader />
	<div class="body">
		<aside
			class="sidebar"
			class:open={board.drawerOpen}
			aria-label="Questions"
			data-testid="questions-sidebar"
		>
			<QuestionsSidebar />
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
			{#if board.view === 'graph'}
				<GraphView />
			{:else if board.view === 'map'}
				<MapView />
			{:else if board.view === 'outline'}
				<OutlineView />
			{:else}
				<FrontierView />
			{/if}
		</main>
		<aside
			class="inspector"
			class:open={board.sheetOpen}
			aria-label="Inspector"
			data-testid="inspector"
		>
			<Inspector />
		</aside>
	</div>
	{@render bottom?.()}
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
		--sb: 300px;
		--ins: 420px;
		height: 100dvh;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		background: var(--bg);
	}
	.board.rail {
		--sb: 52px;
	}
	.body {
		flex: 1;
		min-height: 0;
		display: grid;
		grid-template-columns: var(--sb) minmax(0, 1fr) var(--ins);
		transition: grid-template-columns 220ms var(--ease);
	}
	.sidebar,
	.inspector {
		min-height: 0;
		min-width: 0;
		background: var(--surface);
		overflow: hidden;
	}
	.sidebar {
		border-right: 1px solid var(--line);
	}
	.inspector {
		border-left: 1px solid var(--line);
	}
	.stage {
		position: relative;
		min-width: 0;
		min-height: 0;
		overflow: hidden;
	}
	.scrim {
		display: none;
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

	@media (max-width: 1240px) {
		.board {
			--sb: 264px;
			--ins: 360px;
		}
	}

	@media (max-width: 900px) {
		.body {
			grid-template-columns: minmax(0, 1fr);
		}
		.sidebar {
			position: fixed;
			z-index: 40;
			inset: 0 auto 0 0;
			width: min(340px, 88vw);
			translate: -102% 0;
			transition: translate 220ms var(--ease);
			box-shadow: var(--shadow-pop);
		}
		.sidebar.open {
			translate: 0 0;
		}
		.scrim {
			display: block;
			position: fixed;
			inset: 0;
			z-index: 39;
			border: 0;
			background: rgb(0 0 0 / 0.38);
		}
		.inspector {
			position: fixed;
			z-index: 30;
			left: 0;
			right: 0;
			bottom: 0;
			height: min(64dvh, 640px);
			border-left: 0;
			border-top: 1px solid var(--line);
			border-radius: 16px 16px 0 0;
			box-shadow: 0 -12px 32px -16px rgb(0 0 0 / 0.5);
			translate: 0 calc(100% - 56px);
			transition: translate 240ms var(--ease);
		}
		.inspector.open {
			translate: 0 0;
		}
	}
</style>
