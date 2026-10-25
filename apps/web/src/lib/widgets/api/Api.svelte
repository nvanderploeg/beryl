<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import type { ApiData } from '../types.ts';
	import type { TypeProps } from '../props.ts';
	import Element from '../Element.svelte';
	import { changeColor, changeSymbol } from '../change.ts';
	import { countChanges } from '../shared/counts.ts';
	import ChangeCounts from '../shared/ChangeCounts.svelte';
	import CodeBlock from '../shared/CodeBlock.svelte';
	import { guessLanguage } from '../shared/highlight.ts';
	import { isTool, methodColor, pathParts } from './methods.ts';

	type Endpoint = ApiData['endpoints'][number];

	let { data, widget, lod, marks, selected, onselect }: TypeProps<ApiData> = $props();

	const PREVIEW_ROWS = 7;

	const counts = $derived(countChanges(data.endpoints));
	const open = new SvelteSet<string>();
	const previewRows = $derived(
		data.endpoints.length > PREVIEW_ROWS
			? data.endpoints.slice(0, PREVIEW_ROWS - 1)
			: data.endpoints
	);

	function toggle(event: Event, key: string) {
		event.stopPropagation();
		if (open.has(key)) open.delete(key);
		else open.add(key);
	}

	function keepSelection(event: KeyboardEvent) {
		if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
	}

	function shapes(endpoint: Endpoint): string {
		return [endpoint.request && 'request', endpoint.response && 'response']
			.filter(Boolean)
			.join(' · ');
	}
</script>

{#snippet method(endpoint: Endpoint)}
	<span
		class="method"
		class:tool={isTool(endpoint.method)}
		style="--c: {methodColor(endpoint.method)}">{endpoint.method.toUpperCase()}</span
	>
{/snippet}

{#snippet path(endpoint: Endpoint)}
	<span class="path"
		>{#each pathParts(endpoint.path) as part, i (i)}{#if part.param}<span class="param"
					>{part.text}</span
				>{:else}{#each part.text.split(/(?<=\/)/) as piece, j (j)}{piece}<wbr
					/>{/each}{/if}{/each}</span
	>
{/snippet}

{#if lod === 'preview'}
	<div class="frame preview">
		<header class="head">
			<span class="title">{widget.title ?? 'API'}</span>
			<span class="meta">
				<ChangeCounts {counts} />
				<span>{data.endpoints.length} endpoint{data.endpoints.length === 1 ? '' : 's'}</span>
			</span>
		</header>
		<ul class="mini">
			{#each previewRows as endpoint (endpoint.key)}
				<li class="mini-row" class:removed={endpoint.change === 'removed'}>
					{@render method(endpoint)}
					{@render path(endpoint)}
					{#if endpoint.change}
						<span class="chg sm" style="--c: {changeColor(endpoint.change)}"
							>{changeSymbol(endpoint.change)}</span
						>
					{/if}
				</li>
			{/each}
			{#if previewRows.length < data.endpoints.length}
				<li class="mini-more">+{data.endpoints.length - previewRows.length} more</li>
			{/if}
		</ul>
	</div>
{:else}
	<section class="frame">
		<header class="head">
			<span class="title">{widget.title ?? 'API'}</span>
			<span class="meta">
				<ChangeCounts {counts} />
				<span>{data.endpoints.length} endpoint{data.endpoints.length === 1 ? '' : 's'}</span>
			</span>
		</header>
		<div class="list">
			{#each data.endpoints as endpoint (endpoint.key)}
				{@const expandable = !!(endpoint.request || endpoint.response)}
				{@const expanded = open.has(endpoint.key)}
				<Element
					key={endpoint.key}
					change={endpoint.change}
					{marks}
					{selected}
					{onselect}
					class="endpoint"
				>
					<span class="mcell">{@render method(endpoint)}</span>
					<span class="main">
						{@render path(endpoint)}
						{#if endpoint.summary}<span class="summary">{endpoint.summary}</span>{/if}
						{#if expandable}
							<button
								class="toggle"
								aria-expanded={expanded}
								onclick={(event) => toggle(event, endpoint.key)}
								onkeydown={keepSelection}
							>
								<span class="caret" class:open={expanded} aria-hidden="true"></span>
								{shapes(endpoint)}
							</button>
						{/if}
					</span>
					<span class="side">
						{#if endpoint.auth}
							<span class="auth" title="auth: {endpoint.auth}">
								<svg viewBox="0 0 12 12" aria-hidden="true"
									><rect x="2.5" y="5.5" width="7" height="5" rx="1" /><path
										d="M4 5.5V4a2 2 0 0 1 4 0v1.5"
									/></svg
								>{endpoint.auth}
							</span>
						{/if}
						{#if endpoint.change}
							<span class="chg" style="--c: {changeColor(endpoint.change)}" title={endpoint.change}
								>{changeSymbol(endpoint.change)}</span
							>
						{/if}
					</span>
					{#if expandable && expanded}
						<div class="shapes">
							{#if endpoint.request}
								<div class="shape">
									<span class="shape-label">Request</span>
									<CodeBlock
										code={endpoint.request}
										language={guessLanguage(endpoint.request)}
										numbers={false}
									/>
								</div>
							{/if}
							{#if endpoint.response}
								<div class="shape">
									<span class="shape-label">Response</span>
									<CodeBlock
										code={endpoint.response}
										language={guessLanguage(endpoint.response)}
										numbers={false}
									/>
								</div>
							{/if}
						</div>
					{/if}
				</Element>
			{/each}
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
		display: inline-flex;
		gap: 0.6rem;
		margin-left: auto;
		font-size: 0.68rem;
		white-space: nowrap;
		color: var(--muted);
	}
	.chg {
		display: inline-grid;
		flex: none;
		place-items: center;
		width: 1rem;
		height: 1rem;
		border-radius: 0.25rem;
		background: color-mix(in srgb, var(--c) 16%, transparent);
		color: var(--c);
		font-family: var(--font-mono);
		font-size: 0.72rem;
		font-weight: 700;
		line-height: 1;
		text-decoration: none;
	}
	.chg.sm {
		width: 0.85rem;
		height: 0.85rem;
		font-size: 0.6rem;
	}

	.method {
		display: inline-block;
		flex: none;
		min-width: 3.3rem;
		padding: 0.08rem 0.3rem;
		border: 1px solid color-mix(in srgb, var(--c) 45%, transparent);
		border-radius: 0.25rem;
		background: color-mix(in srgb, var(--c) 13%, transparent);
		color: var(--c);
		font-family: var(--font-mono);
		font-size: 0.62rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		line-height: 1.35;
		text-align: center;
		text-decoration: none;
	}
	.method.tool {
		border-color: var(--ink);
		background: var(--ink);
		color: var(--surface);
	}
	.path {
		font-family: var(--font-mono);
		font-size: 0.76rem;
		font-weight: 600;
		overflow-wrap: break-word;
	}
	.param {
		color: var(--fog);
	}

	.list {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		padding: 0.45rem 0.5rem 0.55rem;
	}
	.list :global(.endpoint) {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		align-items: start;
		column-gap: 0.6rem;
		padding: 0.35rem 0.45rem;
		border-radius: 0.35rem;
	}
	.list :global(.endpoint:is(.pw-added, .pw-removed, .pw-changed):not(.pw-selected)) {
		background: color-mix(in srgb, var(--pw-change) 7%, transparent);
		box-shadow: inset 2px 0 0 var(--pw-change);
	}
	.mcell {
		padding-top: 0.05rem;
	}
	.main {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		min-width: 0;
	}
	.summary {
		font-size: 0.75rem;
		color: var(--muted);
	}
	.side {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
	}
	.auth {
		display: inline-flex;
		align-items: center;
		gap: 0.2rem;
		padding: 0.02rem 0.4rem 0.02rem 0.3rem;
		border: 1px solid var(--line);
		border-radius: 999px;
		font-size: 0.66rem;
		white-space: nowrap;
		color: var(--muted);
		text-decoration: none;
	}
	.auth svg {
		width: 0.7rem;
		height: 0.7rem;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.2;
	}
	.toggle {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		margin: 0.15rem 0 0 -0.3rem;
		padding: 0.05rem 0.35rem 0.05rem 0.3rem;
		border-radius: 0.25rem;
		font-size: 0.68rem;
		color: var(--muted);
		cursor: pointer;
	}
	.toggle:hover {
		background: var(--surface-2);
		color: var(--ink);
	}
	.toggle:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
	}
	.caret {
		width: 0;
		height: 0;
		border-top: 0.24rem solid transparent;
		border-bottom: 0.24rem solid transparent;
		border-left: 0.32rem solid currentColor;
		transition: transform 120ms;
	}
	.caret.open {
		transform: rotate(90deg);
	}
	.shapes {
		display: grid;
		grid-column: 2 / -1;
		gap: 0.4rem;
		margin-top: 0.35rem;
		cursor: auto;
	}
	.shape {
		display: grid;
		gap: 0.15rem;
	}
	.shape-label {
		font-size: 0.6rem;
		font-weight: 600;
		letter-spacing: 0.07em;
		text-transform: uppercase;
		color: var(--muted);
	}

	.mini {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		margin: 0;
		padding: 0.4rem 0.55rem;
		list-style: none;
	}
	.mini-row {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		min-width: 0;
		height: 1.15rem;
	}
	.mini .method {
		min-width: 2.7rem;
		padding: 0 0.2rem;
		font-size: 0.52rem;
	}
	.mini .path {
		overflow: hidden;
		min-width: 0;
		font-size: 0.64rem;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.mini-row .chg {
		margin-left: auto;
	}
	.mini-row.removed .path {
		text-decoration: line-through;
		text-decoration-color: color-mix(in srgb, var(--removed) 70%, transparent);
	}
	.mini-more {
		font-size: 0.62rem;
		color: var(--muted);
	}
</style>
