<script lang="ts">
	import type { PanelId } from '#lib/ui/layout.ts';
	import Inspector from '../Inspector.svelte';
	import QuestionsSidebar from '../QuestionsSidebar.svelte';

	let { id }: { id: PanelId } = $props();
</script>

{#if id === 'questions'}
	<QuestionsSidebar />
{:else}
	<Inspector part={id} />
{/if}
