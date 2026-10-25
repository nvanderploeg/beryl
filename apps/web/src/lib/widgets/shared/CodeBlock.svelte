<script lang="ts">
	import { highlightLines } from './highlight.ts';
	import { splitLines } from './lines.ts';
	import './highlight.css';

	let {
		code,
		language,
		numbers = true
	}: { code: string; language?: string; numbers?: boolean } = $props();

	const lines = $derived(highlightLines(splitLines(code), language));
	const digits = $derived(String(lines.length).length);
</script>

<div class="codeblock pw-hl">
	<div class="lines" style="--digits: {digits}ch">
		{#each lines as html, i (i)}
			<div class="line">
				{#if numbers}<span class="ln">{i + 1}</span>{/if}
				<!-- eslint-disable-next-line svelte/no-at-html-tags -- escaped by highlight.js -->
				<span class="src">{@html html || ' '}</span>
			</div>
		{/each}
	</div>
</div>

<style>
	.codeblock {
		overflow-x: auto;
		border: 1px solid var(--line);
		border-radius: 0.375rem;
		background: color-mix(in srgb, var(--surface-2) 55%, var(--surface));
	}
	.lines {
		width: max-content;
		min-width: 100%;
		padding: 0.4rem 0;
		font-family: var(--font-mono);
		font-size: 0.72rem;
		line-height: 1.55;
		color: var(--ink);
	}
	.line {
		display: flex;
		padding: 0 0.75rem 0 0.65rem;
	}
	.ln {
		flex: none;
		width: var(--digits);
		margin-right: 0.75rem;
		text-align: right;
		color: color-mix(in srgb, var(--muted) 70%, transparent);
		user-select: none;
	}
	.src {
		white-space: pre;
		tab-size: 2;
	}
</style>
