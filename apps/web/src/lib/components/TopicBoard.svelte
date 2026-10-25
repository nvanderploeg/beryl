<script lang="ts">
	import { page } from '$app/state';
	import type { Snapshot } from '#lib/types.ts';
	import { Board, parseView } from '#lib/ui/board.svelte.ts';
	import BoardShell from './Board.svelte';

	let { snapshot }: { snapshot: Snapshot } = $props();

	// svelte-ignore state_referenced_locally
	const board = new Board({
		snapshot,
		mode: 'live',
		view: parseView(page.url.searchParams.get('view')),
		node: page.url.searchParams.get('node')
	});
</script>

<svelte:head>
	<title
		>{board.unsent ? `(${board.unsent}) ` : ''}{board.topic.title} · {board.project.name} · beryl</title
	>
</svelte:head>

<BoardShell {board} />
