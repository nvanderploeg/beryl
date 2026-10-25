<script lang="ts">
	import type { MarkdownData } from '../types.ts';
	import type { TypeProps } from '../props.ts';
	import { renderMarkdown } from './render.ts';
	import '../shared/highlight.css';

	let { data, widget, lod }: TypeProps<MarkdownData> = $props();

	const html = $derived(renderMarkdown(data.text));
</script>

<section class="frame" class:preview={lod === 'preview'}>
	{#if widget.title}
		<header class="head"><span class="title">{widget.title}</span></header>
	{/if}
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- markdown-it with html disabled escapes the source -->
	<div class="md pw-hl">{@html html}</div>
</section>

<style>
	.frame {
		display: flex;
		flex-direction: column;
		border: 1px solid var(--line);
		border-radius: 0.5rem;
		background: var(--surface);
		color: var(--ink);
	}
	.preview {
		height: 100%;
		box-sizing: border-box;
		overflow: hidden;
	}
	.head {
		display: flex;
		align-items: center;
		min-height: 1.6rem;
		padding: 0 0.6rem;
		border-bottom: 1px solid var(--line);
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

	.md {
		padding: 0.6rem 0.8rem 0.7rem;
		font-size: 0.85rem;
		line-height: 1.55;
		overflow-wrap: anywhere;
	}
	.preview .md {
		flex: 1;
		min-height: 0;
		overflow: hidden;
		padding: 0.45rem 0.65rem;
		font-size: 0.68rem;
		line-height: 1.45;
		mask-image: linear-gradient(to bottom, #000 75%, transparent);
	}
	.md > :global(:first-child) {
		margin-top: 0;
	}
	.md > :global(:last-child) {
		margin-bottom: 0;
	}
	.md :global(:where(p, ul, ol, pre, blockquote, table)) {
		margin: 0 0 0.6em;
	}
	.md :global(:where(h1, h2, h3, h4, h5, h6)) {
		margin: 0.9em 0 0.4em;
		font-weight: 650;
		line-height: 1.25;
		color: var(--ink);
	}
	.md :global(h1) {
		font-size: 1.2em;
	}
	.md :global(h2) {
		font-size: 1.08em;
	}
	.md :global(h3) {
		font-size: 1em;
	}
	.md :global(:where(h4, h5, h6)) {
		font-size: 0.92em;
		color: var(--muted);
	}
	.md :global(:where(ul, ol)) {
		padding-left: 1.25em;
	}
	.md :global(ul) {
		list-style: disc;
	}
	.md :global(ol) {
		list-style: decimal;
	}
	.md :global(li) {
		margin: 0.15em 0;
	}
	.md :global(li::marker) {
		color: var(--muted);
	}
	.md :global(:where(li > ul, li > ol)) {
		margin: 0.15em 0 0;
	}
	.md :global(strong) {
		font-weight: 650;
	}
	.md :global(a) {
		color: var(--accent);
		text-decoration: underline;
		text-decoration-color: color-mix(in srgb, var(--accent) 40%, transparent);
		text-underline-offset: 2px;
	}
	.md :global(a:hover) {
		text-decoration-color: var(--accent);
	}
	.md :global(code) {
		padding: 0.05em 0.3em;
		border: 1px solid color-mix(in srgb, var(--line) 70%, transparent);
		border-radius: 0.25rem;
		background: color-mix(in srgb, var(--surface-2) 70%, var(--surface));
		font-family: var(--font-mono);
		font-size: 0.86em;
	}
	.md :global(pre) {
		overflow-x: auto;
		padding: 0.5em 0.7em;
		border: 1px solid var(--line);
		border-radius: 0.375rem;
		background: color-mix(in srgb, var(--surface-2) 55%, var(--surface));
		line-height: 1.5;
	}
	.md :global(pre code) {
		padding: 0;
		border: 0;
		background: none;
		font-size: 0.82em;
	}
	.md :global(blockquote) {
		padding-left: 0.75em;
		border-left: 3px solid var(--line);
		color: var(--muted);
	}
	.md :global(hr) {
		margin: 0.9em 0;
		border: 0;
		border-top: 1px solid var(--line);
	}
	.md :global(table) {
		display: block;
		overflow-x: auto;
		border-collapse: collapse;
		font-size: 0.92em;
	}
	.md :global(:where(th, td)) {
		padding: 0.25em 0.6em;
		border: 1px solid var(--line);
		text-align: left;
	}
	.md :global(th) {
		background: color-mix(in srgb, var(--surface-2) 55%, var(--surface));
		font-weight: 600;
	}
	.md :global(img) {
		max-width: 100%;
	}
</style>
