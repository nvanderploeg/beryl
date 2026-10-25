<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { captureNoteKey } from '#lib/ui/notekey.ts';

	let { children } = $props();

	onMount(() => {
		captureNoteKey(page.params.id ?? '');
	});
</script>

{@render children()}
