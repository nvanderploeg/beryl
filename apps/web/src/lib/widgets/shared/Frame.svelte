<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Change } from '../types.ts';
	import { changeColor, changeSymbol } from '../change.ts';

	let {
		title,
		lod,
		meta,
		changes = [],
		children
	}: {
		title: string;
		lod: 'preview' | 'full';
		meta?: string;
		changes?: (Change | 'kept' | undefined)[];
		children: Snippet;
	} = $props();

	const order = ['added', 'changed', 'renamed', 'removed'] as const;
	const tally = $derived(
		order
			.map((change) => ({ change, count: changes.filter((c) => c === change).length }))
			.filter((t) => t.count > 0)
	);
</script>

<section class="frame" class:preview={lod === 'preview'}>
	<header class="head">
		<span class="title">{title}</span>
		<span class="meta">
			{#if tally.length}
				<span class="tally">
					{#each tally as t (t.change)}
						<span class="count" style:--c={changeColor(t.change)} title="{t.count} {t.change}"
							>{changeSymbol(t.change)}{t.count}</span
						>
					{/each}
				</span>
			{/if}
			{#if meta}<span>{meta}</span>{/if}
		</span>
	</header>
	<div class="body">
		{@render children()}
	</div>
</section>

<style>
	.frame {
		border: 1px solid var(--line);
		border-radius: 0.5rem;
		background: var(--surface);
		color: var(--ink);
		font-family: var(--font-sans);
		min-width: 0;
	}
	.preview {
		height: 100%;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}
	.head {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-height: 1.9rem;
		padding: 0 0.65rem;
		border-bottom: 1px solid var(--line);
	}
	.preview .head {
		min-height: 1.6rem;
	}
	.title {
		overflow: hidden;
		font-size: 0.66rem;
		font-weight: 600;
		letter-spacing: 0.07em;
		text-transform: uppercase;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--muted);
	}
	.meta {
		display: inline-flex;
		align-items: center;
		gap: 0.6rem;
		margin-left: auto;
		font-size: 0.68rem;
		white-space: nowrap;
		color: var(--muted);
	}
	.tally {
		display: inline-flex;
		gap: 0.25rem;
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
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
	.body {
		position: relative;
		min-width: 0;
	}
	.preview .body {
		flex: 1;
		min-height: 0;
	}
</style>
