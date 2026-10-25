<script lang="ts">
	let { type, reason }: { type: string; reason: string } = $props();
</script>

<div class="fallback" data-testid="widget-fallback">
	<strong>{type}</strong> widget could not be shown: {reason}
</div>

<style>
	.fallback {
		border: 1px dashed var(--removed);
		border-radius: 0.5rem;
		padding: 0.5rem 0.75rem;
		color: var(--muted);
		font-size: 0.8rem;
	}
</style>
