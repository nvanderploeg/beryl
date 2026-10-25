<script lang="ts">
	import type { CodeData } from '../types.ts';
	import type { TypeProps } from '../props.ts';
	import Element from '../Element.svelte';
	import { highlightLines, languageOf } from '../shared/highlight.ts';
	import { splitLines } from '../shared/lines.ts';
	import '../shared/highlight.css';

	let { data, widget, lod, marks, selected, onselect }: TypeProps<CodeData> = $props();

	const PREVIEW_LINES = 9;

	const language = $derived(languageOf(data.language, data.filename));
	const lines = $derived(highlightLines(splitLines(data.code), language));
	const emphasised = $derived(new Set(data.highlight ?? []));
	const digits = $derived(String(lines.length).length);
	const label = $derived(data.language ?? language ?? '');

	const previewStart = $derived.by(() => {
		const first = Math.min(...emphasised);
		return Number.isFinite(first) && first > PREVIEW_LINES ? first - 3 : 0;
	});
	const previewLines = $derived(lines.slice(previewStart, previewStart + PREVIEW_LINES));

	function tail(text: string, max: number): string {
		return text.length > max ? `…${text.slice(-(max - 1))}` : text;
	}
</script>

{#if lod === 'preview'}
	<div class="frame preview pw-hl">
		<header class="head">
			{#if data.filename}
				<span class="file" title={data.filename}>{tail(data.filename, 44)}</span>
			{:else}
				<span class="title">{widget.title ?? 'Code'}</span>
			{/if}
			<span class="meta">{lines.length} line{lines.length === 1 ? '' : 's'}</span>
		</header>
		<div class="lines" style="--digits: {digits}ch">
			{#each previewLines as html, i (i)}
				{@const n = previewStart + i + 1}
				<div class="line" class:hl={emphasised.has(n)}>
					<span class="ln">{n}</span>
					<!-- eslint-disable-next-line svelte/no-at-html-tags -- escaped by highlight.js -->
					<span class="src">{@html html || ' '}</span>
				</div>
			{/each}
		</div>
	</div>
{:else}
	<section class="frame">
		<header class="head">
			<span class="title">{widget.title ?? 'Code'}</span>
			{#if label}<span class="meta">{label}</span>{/if}
		</header>
		{#if data.filename}
			<div class="filebar"><span class="file">{data.filename}</span></div>
		{/if}
		<div class="scroll pw-hl">
			<div class="lines" style="--digits: {digits}ch">
				{#each lines as html, i (i)}
					<Element
						key="L{i + 1}"
						{marks}
						{selected}
						{onselect}
						class={emphasised.has(i + 1) ? 'line hl' : 'line'}
					>
						<span class="ln">{i + 1}</span>
						<!-- eslint-disable-next-line svelte/no-at-html-tags -- escaped by highlight.js -->
						<span class="src">{@html html || ' '}</span>
					</Element>
				{/each}
			</div>
		</div>
	</section>
{/if}

<style>
	.frame {
		display: flex;
		flex-direction: column;
		border: 1px solid var(--line);
		border-radius: 0.5rem;
		background: var(--surface);
		color: var(--ink);
		font-size: 0.8125rem;
		line-height: 1.4;
	}
	.preview {
		height: 100%;
		box-sizing: border-box;
		overflow: hidden;
	}
	.head {
		display: flex;
		align-items: center;
		gap: 0.5rem;
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
	.meta {
		margin-left: auto;
		font-size: 0.68rem;
		white-space: nowrap;
		color: var(--muted);
	}
	.file {
		overflow: hidden;
		font-family: var(--font-mono);
		font-size: 0.72rem;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--ink);
	}
	.preview .file {
		font-size: 0.66rem;
	}
	.filebar {
		display: flex;
		padding: 0.3rem 0.65rem;
		border-bottom: 1px solid var(--line);
		background: color-mix(in srgb, var(--surface-2) 55%, var(--surface));
	}
	.filebar .file {
		overflow-wrap: anywhere;
		white-space: normal;
	}
	.scroll {
		overflow-x: auto;
		padding: 0.5rem 0.6rem 0.5rem 0;
	}
	.lines {
		width: max-content;
		min-width: 100%;
		font-family: var(--font-mono);
		font-size: 0.75rem;
		line-height: 1.6;
	}
	.preview .lines {
		width: auto;
		padding: 0.3rem 0;
		font-size: 0.62rem;
		line-height: 1.55;
	}
	.line,
	.lines :global(.line) {
		display: flex;
		padding-right: 0.75rem;
	}
	.ln {
		position: sticky;
		left: 0;
		flex: none;
		width: var(--digits);
		padding: 0 0.75rem 0 1.5rem;
		text-align: right;
		background: var(--surface);
		color: color-mix(in srgb, var(--muted) 65%, transparent);
		user-select: none;
	}
	.preview .ln {
		position: static;
		padding: 0 0.6rem 0 0.5rem;
		background: none;
	}
	.src {
		white-space: pre;
		tab-size: 2;
	}
	.preview .src {
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.line.hl,
	.lines :global(.line.hl) {
		background: color-mix(in srgb, var(--accent) 10%, transparent);
		box-shadow: inset 2px 0 0 var(--accent);
	}
	.line.hl .ln,
	.lines :global(.line.hl .ln) {
		background: color-mix(in srgb, var(--accent) 10%, var(--surface));
		color: var(--accent);
	}
	.lines :global(.line.pw-selected .ln) {
		background: color-mix(in srgb, var(--accent) 10%, var(--surface));
	}
	.lines :global(.pw-element > .pw-mark) {
		top: 50%;
		right: auto;
		left: 0.2rem;
		transform: translateY(-50%);
	}
</style>
