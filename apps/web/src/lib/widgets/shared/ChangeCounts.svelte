<script lang="ts">
	import { changeColor, changeSymbol } from '../change.ts';
	import type { Change } from '../types.ts';
	import type { ChangeCounts } from './counts.ts';

	let { counts, words = false }: { counts: ChangeCounts; words?: boolean } = $props();

	const order: Change[] = ['added', 'changed', 'renamed', 'removed'];
	const shown = $derived(order.filter((change) => counts[change] > 0));
</script>

{#if shown.length}
	<span class="counts">
		{#each shown as change (change)}
			<span class="count" style="--c: {changeColor(change)}" title="{counts[change]} {change}"
				>{changeSymbol(change)}{counts[change]}{#if words}<span class="word">{change}</span
					>{/if}</span
			>
		{/each}
	</span>
{/if}

<style>
	.counts {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
		text-decoration: none;
	}
	.count {
		padding: 0 0.28em;
		border-radius: 0.25rem;
		background: color-mix(in srgb, var(--c) 15%, transparent);
		color: var(--c);
		font-size: 0.95em;
		font-weight: 700;
		line-height: 1.45;
	}
	.word {
		margin-left: 0.3em;
		font-family: var(--font-sans);
		font-weight: 500;
	}
</style>
