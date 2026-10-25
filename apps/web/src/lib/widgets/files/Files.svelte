<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import type { FileEntry, FilesData } from '../types.ts';
	import type { TypeProps } from '../props.ts';
	import Element from '../Element.svelte';
	import { changeColor, changeSymbol } from '../change.ts';
	import ChangeCounts from '../shared/ChangeCounts.svelte';
	import { buildTree, treeRows } from './tree.ts';

	let { data, widget, lod, marks, selected, onselect }: TypeProps<FilesData> = $props();

	const PREVIEW_FILES = 6;
	const BLOCKS = 5;

	const tree = $derived(buildTree(data.files));
	const collapsed = new SvelteSet<string>();
	const rows = $derived(treeRows(tree, collapsed));
	const unchanged = $derived(data.files.filter((f) => !f.change).length);
	const kinds = $derived(Object.values(tree.counts).filter((n) => n > 0).length);

	$effect(() => {
		const key = selected;
		if (!key) return;
		for (const path of [...collapsed]) {
			if (key.startsWith(path + '/')) collapsed.delete(path);
		}
	});

	function toggle(path: string) {
		if (collapsed.has(path)) collapsed.delete(path);
		else collapsed.add(path);
	}

	function split(path: string): { dir: string; name: string } {
		const at = path.lastIndexOf('/');
		return at < 0 ? { dir: '', name: path } : { dir: path.slice(0, at), name: path.slice(at + 1) };
	}

	function tail(text: string, max: number): string {
		return text.length > max ? `…${text.slice(-(max - 1))}` : text;
	}

	function churn(file: FileEntry): number {
		return (file.added ?? 0) + (file.removed ?? 0);
	}

	function blocks(added: number, removed: number): ('a' | 'r' | 'n')[] {
		const total = added + removed;
		if (total === 0) return [];
		let a = Math.round((BLOCKS * added) / total);
		if (added > 0 && a === 0) a = 1;
		if (removed > 0 && a === BLOCKS) a = BLOCKS - 1;
		return Array.from({ length: BLOCKS }, (_, i) => (i < a ? 'a' : 'r'));
	}

	const previewFiles = $derived(
		[...data.files]
			.sort((a, b) => Number(!a.change) - Number(!b.change) || churn(b) - churn(a))
			.slice(0, data.files.length > PREVIEW_FILES ? PREVIEW_FILES - 1 : PREVIEW_FILES)
	);
</script>

{#snippet lines(added: number, removed: number)}
	<span class="lines">
		{#if added}<span class="plus">+{added}</span>{/if}
		{#if removed}<span class="minus">−{removed}</span>{/if}
	</span>
{/snippet}

{#snippet mark(file: FileEntry)}
	{#if file.change}
		<span class="chg" style="--c: {changeColor(file.change)}" title={file.change}
			>{changeSymbol(file.change)}</span
		>
	{:else}
		<span class="chg ref" title="referenced, not changed">·</span>
	{/if}
{/snippet}

{#if lod === 'preview'}
	<div class="frame preview">
		<header class="head">
			<span class="title">{widget.title ?? 'Files'}</span>
			<span class="meta">
				{@render lines(tree.added, tree.removed)}
				<span>{data.files.length} file{data.files.length === 1 ? '' : 's'}</span>
			</span>
		</header>
		<div class="summary">
			<ChangeCounts counts={tree.counts} words={kinds <= 3} />
			{#if unchanged}<span class="refs">{unchanged} unchanged</span>{/if}
		</div>
		<ul class="mini">
			{#each previewFiles as file (file.path)}
				{@const parts = split(file.path)}
				<li class="mini-file" class:removed={file.change === 'removed'}>
					{@render mark(file)}
					<span class="mini-name">{parts.name}</span>
					<span class="mini-dir" title={parts.dir}>{tail(parts.dir, 30)}</span>
					{@render lines(file.added ?? 0, file.removed ?? 0)}
				</li>
			{/each}
			{#if previewFiles.length < data.files.length}
				<li class="mini-more">+{data.files.length - previewFiles.length} more</li>
			{/if}
		</ul>
	</div>
{:else}
	<section class="frame">
		<header class="head">
			<span class="title">{widget.title ?? 'Files'}</span>
			<span class="meta">
				<ChangeCounts counts={tree.counts} />
				{@render lines(tree.added, tree.removed)}
				<span>{data.files.length} file{data.files.length === 1 ? '' : 's'}</span>
			</span>
		</header>
		{#if data.root}
			<div class="root"><span>{data.root.replace(/\/?$/, '/')}</span></div>
		{/if}
		<div class="tree">
			{#each rows as row (row.kind === 'dir' ? `d:${row.dir.path}` : `f:${row.node.file.path}`)}
				{#if row.kind === 'dir'}
					{@const open = !collapsed.has(row.dir.path)}
					<button
						class="dir"
						style="--depth: {row.depth}"
						aria-expanded={open}
						onclick={() => toggle(row.dir.path)}
					>
						<span class="caret" class:open aria-hidden="true"></span>
						<span class="dname">{row.dir.name}/</span>
						<span class="dmeta">
							{#if !open}<span class="hidden-count"
									>{row.dir.total} file{row.dir.total === 1 ? '' : 's'}</span
								>{/if}
							<ChangeCounts counts={row.dir.counts} />
							{@render lines(row.dir.added, row.dir.removed)}
						</span>
					</button>
				{:else}
					{@const file = row.node.file}
					<Element
						key={file.path}
						change={file.change}
						{marks}
						{selected}
						{onselect}
						class="file {file.change ? '' : 'unchanged'}"
					>
						<span class="indent" style="--depth: {row.depth}"></span>
						{@render mark(file)}
						<span class="main">
							<span class="fname" title={file.path}>{row.node.name}</span>
							{#if file.change === 'renamed' && file.from}
								<span class="from" title="renamed from {file.from}">← {file.from}</span>
							{/if}
							{#if file.summary}<span class="fsummary">{file.summary}</span>{/if}
						</span>
						{@render lines(file.added ?? 0, file.removed ?? 0)}
						<span class="bar" aria-hidden="true">
							{#each blocks(file.added ?? 0, file.removed ?? 0) as b, i (i)}
								<span class="blk {b}"></span>
							{/each}
						</span>
					</Element>
				{/if}
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
	.chg.ref {
		--c: var(--muted);
		background: none;
		box-shadow: inset 0 0 0 1px var(--line);
	}
	.lines {
		display: inline-flex;
		gap: 0.35em;
		font-family: var(--font-mono);
		font-size: 0.68rem;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.plus {
		color: var(--added);
	}
	.minus {
		color: var(--removed);
	}

	.root {
		padding: 0.3rem 0.65rem;
		border-bottom: 1px solid color-mix(in srgb, var(--line) 60%, transparent);
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--muted);
	}
	.tree {
		padding: 0.4rem 0.5rem 0.55rem;
	}
	.dir {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		width: 100%;
		padding: 0.18rem 0.35rem 0.18rem calc(0.35rem + var(--depth) * 0.95rem);
		border-radius: 0.3rem;
		font-family: var(--font-mono);
		font-size: 0.74rem;
		text-align: left;
		color: var(--muted);
		cursor: pointer;
	}
	.dir:hover {
		background: color-mix(in srgb, var(--surface-2) 70%, transparent);
		color: var(--ink);
	}
	.dir:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
	}
	.caret {
		flex: none;
		width: 0;
		height: 0;
		margin: 0 0.2rem 0 0.25rem;
		border-top: 0.25rem solid transparent;
		border-bottom: 0.25rem solid transparent;
		border-left: 0.32rem solid currentColor;
		transition: transform 120ms;
	}
	.caret.open {
		transform: rotate(90deg);
	}
	.dname {
		overflow: hidden;
		font-weight: 600;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.dmeta {
		display: inline-flex;
		flex: none;
		align-items: center;
		gap: 0.55rem;
		margin-left: auto;
		font-size: 0.66rem;
	}
	.hidden-count {
		font-family: var(--font-sans);
		color: var(--muted);
	}
	.tree :global(.file) {
		display: grid;
		grid-template-columns: auto 1rem minmax(0, 1fr) auto auto;
		align-items: start;
		column-gap: 0.45rem;
		padding: 0.22rem 0.4rem 0.22rem 0.35rem;
		border-radius: 0.3rem;
	}
	.tree :global(.file:is(.pw-added, .pw-removed, .pw-changed):not(.pw-selected)) {
		background: color-mix(in srgb, var(--pw-change) 8%, transparent);
	}
	.indent {
		width: calc(var(--depth) * 0.95rem + 0.95rem);
	}
	.tree :global(.file > .chg) {
		margin-top: 0.08rem;
	}
	.main {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.fname {
		overflow: hidden;
		font-family: var(--font-mono);
		font-size: 0.76rem;
		font-weight: 600;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.tree :global(.file.unchanged .fname) {
		font-weight: 400;
		color: var(--muted);
	}
	.from {
		overflow: hidden;
		font-family: var(--font-mono);
		font-size: 0.66rem;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--muted);
	}
	.fsummary {
		font-size: 0.72rem;
		color: var(--muted);
	}
	.tree :global(.file > .lines) {
		margin-top: 0.12rem;
	}
	.bar {
		display: inline-flex;
		gap: 1px;
		margin-top: 0.3rem;
	}
	.blk {
		width: 0.38rem;
		height: 0.38rem;
		border-radius: 1px;
	}
	.blk.a {
		background: var(--added);
	}
	.blk.r {
		background: var(--removed);
	}

	.summary {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		overflow: hidden;
		padding: 0.4rem 0.6rem 0.2rem;
		font-size: 0.6rem;
		white-space: nowrap;
	}
	.refs {
		color: var(--muted);
	}
	.mini {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		margin: 0;
		padding: 0.2rem 0.6rem;
		list-style: none;
	}
	.mini-file {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		min-width: 0;
		height: 1.1rem;
		font-size: 0.66rem;
	}
	.mini-file .chg {
		width: 0.9rem;
		height: 0.9rem;
		font-size: 0.62rem;
	}
	.mini-name {
		flex: none;
		max-width: 9rem;
		overflow: hidden;
		font-family: var(--font-mono);
		font-weight: 600;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.mini-file.removed .mini-name {
		text-decoration: line-through;
		text-decoration-color: color-mix(in srgb, var(--removed) 70%, transparent);
	}
	.mini-dir {
		overflow: hidden;
		min-width: 0;
		font-family: var(--font-mono);
		font-size: 0.6rem;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--muted);
	}
	.mini-file .lines {
		margin-left: auto;
		font-size: 0.6rem;
	}
	.mini-more {
		padding-left: 1.3rem;
		font-size: 0.62rem;
		color: var(--muted);
	}
</style>
