<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import BoardShell from '#lib/components/Board.svelte';
	import TurnScrubber from '#lib/components/TurnScrubber.svelte';
	import { Board, parseView } from '#lib/ui/board.svelte.ts';

	let { data } = $props();

	// Turns go through board.replace; rebuilding the board would drop selection and zoom.
	// svelte-ignore state_referenced_locally
	const board = new Board({
		snapshot: data.snapshot,
		mode: 'demo',
		view: parseView(page.url.searchParams.get('view')),
		node: page.url.searchParams.get('node'),
		since: data.since,
		history: (path) => data.events.filter((e) => e.path === path)
	});

	// svelte-ignore state_referenced_locally
	let shown = data.turn;
	$effect(() => {
		if (data.turn === shown) return;
		shown = data.turn;
		board.replace(data.snapshot, data.since);
	});

	function toTurn(n: number) {
		const url = new URL(location.href);
		if (n === data.total) url.searchParams.delete('turn');
		else url.searchParams.set('turn', String(n));
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- same page, query only
		void goto(url, { replace: true, reset: false });
	}
</script>

<svelte:head>
	<title>Demo: {board.topic.title} · palantir</title>
	<meta
		name="description"
		content="A scripted grill about team workspaces, folded turn by turn onto a palantir board."
	/>
</svelte:head>

<BoardShell {board}>
	{#snippet top()}
		<div class="banner" data-testid="demo-banner">
			<span class="tag">Demo</span>
			<span class="text"
				>A scripted grill about adding team workspaces to a tracker. It is read-only: notes and Send
				are switched off.</span
			>
			<a href={resolve('/')}>What is palantir?</a>
		</div>
	{/snippet}
	{#snippet bottom()}
		<TurnScrubber turn={data.turn} total={data.total} says={data.says} onturn={toTurn} />
	{/snippet}
</BoardShell>

<style>
	.banner {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.4rem 1rem;
		border-bottom: 1px solid var(--line);
		background: color-mix(in srgb, var(--fog) 10%, var(--surface));
		font-size: 0.8rem;
	}
	.tag {
		flex: none;
		padding: 0 0.5rem;
		border-radius: 999px;
		border: 1px solid color-mix(in srgb, var(--fog) 60%, transparent);
		color: var(--fog);
		font-weight: 650;
	}
	.text {
		flex: 1;
		min-width: 0;
		color: var(--muted);
	}
	a {
		flex: none;
		color: var(--ink);
		text-underline-offset: 3px;
	}
	@media (max-width: 640px) {
		.text {
			overflow: hidden;
			white-space: nowrap;
			text-overflow: ellipsis;
		}
	}
</style>
