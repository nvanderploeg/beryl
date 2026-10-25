<script lang="ts">
	import TopicBoard from '#lib/components/TopicBoard.svelte';

	let { data } = $props();
</script>

<!-- Keep the key: SvelteKit reuses this page across topics, and a board follows one. -->
{#key data.snapshot.topic.id}
	<TopicBoard snapshot={data.snapshot} />
{/key}
