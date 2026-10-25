<script lang="ts">
	import type { TableData } from '../types.ts';
	import type { TypeProps } from '../props.ts';
	import Element from '../Element.svelte';
	import { changeColor, changeSymbol } from '../change.ts';
	import { cellKind, cellText } from '../shared/cells.ts';
	import { countChanges } from '../shared/counts.ts';
	import ChangeCounts from '../shared/ChangeCounts.svelte';

	let { data, widget, lod, marks, selected, onselect }: TypeProps<TableData> = $props();

	const PREVIEW_ROWS = 6;
	const PREVIEW_COLUMNS = 5;

	const counts = $derived(countChanges(data.rows));
	const hasChanges = $derived(data.rows.some((row) => row.change));
	const previewColumns = $derived(data.columns.slice(0, PREVIEW_COLUMNS));
	const previewRows = $derived(data.rows.slice(0, PREVIEW_ROWS));
	const align = $derived(data.columns.map((_, c) => columnAlign(c)));

	function columnAlign(c: number): 'start' | 'center' | 'end' {
		const kinds = new Set(
			data.rows.map((row) => cellKind(row.cells[c] ?? null)).filter((k) => k !== 'null')
		);
		if (kinds.size === 0) return 'start';
		if ([...kinds].every((k) => k === 'true' || k === 'false')) return 'center';
		if ([...kinds].every((k) => k === 'number')) return 'end';
		return 'start';
	}

	function plural(n: number, word: string): string {
		return `${n} ${word}${n === 1 ? '' : 's'}`;
	}
</script>

{#if lod === 'preview'}
	<div class="frame preview">
		<header class="head">
			<span class="title">{widget.title ?? 'Table'}</span>
			<span class="meta">
				<ChangeCounts {counts} />
				<span>{plural(data.rows.length, 'row')}</span>
			</span>
		</header>
		<div class="mini">
			<table>
				<thead>
					<tr>
						{#if hasChanges}<th class="gut"></th>{/if}
						{#each previewColumns as column, i (i)}<th class="a-{align[i]}">{column}</th>{/each}
					</tr>
				</thead>
				<tbody>
					{#each previewRows as row (row.key)}
						<tr class="c-{row.change ?? 'none'}" style="--c: {changeColor(row.change)}">
							{#if hasChanges}<td class="gut">{changeSymbol(row.change)}</td>{/if}
							{#each row.cells.slice(0, PREVIEW_COLUMNS) as cell, i (i)}
								<td class="k-{cellKind(cell)} a-{align[i]}">{cellText(cell)}</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
			{#if data.rows.length > PREVIEW_ROWS || data.columns.length > PREVIEW_COLUMNS}
				<div class="more">
					{[
						data.rows.length > PREVIEW_ROWS && `+${plural(data.rows.length - PREVIEW_ROWS, 'row')}`,
						data.columns.length > PREVIEW_COLUMNS &&
							`+${plural(data.columns.length - PREVIEW_COLUMNS, 'column')}`
					]
						.filter(Boolean)
						.join(' · ')}
				</div>
			{/if}
		</div>
	</div>
{:else}
	<section class="frame">
		<header class="head">
			<span class="title">{widget.title ?? 'Table'}</span>
			<span class="meta">
				<ChangeCounts {counts} />
				<span>{plural(data.rows.length, 'row')}</span>
			</span>
		</header>
		<div class="scroll">
			<div class="grid" style="--columns: {data.columns.length}">
				<div class="row header">
					<span class="gut"></span>
					{#each data.columns as column, i (i)}<span class="th a-{align[i]}">{column}</span>{/each}
				</div>
				{#each data.rows as row (row.key)}
					<Element key={row.key} change={row.change} {marks} {selected} {onselect} class="row">
						<span class="gut">
							{#if row.change}
								<span class="chg" style="--c: {changeColor(row.change)}" title={row.change}>
									{changeSymbol(row.change)}
								</span>
							{/if}
						</span>
						{#each row.cells as cell, i (i)}
							<span class="td k-{cellKind(cell)} a-{align[i]}">{cellText(cell)}</span>
						{/each}
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
		display: inline-flex;
		gap: 0.6rem;
		margin-left: auto;
		font-size: 0.68rem;
		white-space: nowrap;
		color: var(--muted);
	}

	.scroll {
		overflow-x: auto;
		padding: 0.5rem 0.6rem 0.6rem;
	}
	.grid {
		display: grid;
		grid-template-columns: 1.5rem repeat(var(--columns), auto);
		width: max-content;
		min-width: 100%;
	}
	.row,
	.grid :global(.row) {
		display: grid;
		grid-column: 1 / -1;
		grid-template-columns: subgrid;
		align-items: center;
		border-bottom: 1px solid color-mix(in srgb, var(--line) 65%, transparent);
	}
	.grid :global(.row:last-child) {
		border-bottom: 0;
	}
	.grid :global(.row:is(.pw-added, .pw-removed, .pw-changed):not(.pw-selected)) {
		background: color-mix(in srgb, var(--pw-change) 8%, transparent);
		box-shadow: inset 2px 0 0 var(--pw-change);
	}
	.header {
		border-bottom-color: var(--line);
	}
	.th {
		padding: 0.3rem 0.65rem 0.35rem;
		font-size: 0.7rem;
		font-weight: 600;
		white-space: nowrap;
		color: var(--muted);
	}
	.td {
		padding: 0.28rem 0.65rem;
		white-space: nowrap;
	}
	.gut {
		display: flex;
		justify-content: center;
	}
	.chg {
		display: inline-grid;
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
	}
	.a-center {
		text-align: center;
	}
	.a-end {
		text-align: right;
	}
	.k-number {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		font-variant-numeric: tabular-nums;
	}
	.k-true {
		color: var(--settled);
		font-weight: 700;
	}
	.k-false {
		color: var(--muted);
	}
	.k-null {
		color: color-mix(in srgb, var(--muted) 45%, transparent);
	}

	.mini {
		padding: 0.2rem 0.5rem 0;
	}
	.mini table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.62rem;
		line-height: 1.3;
	}
	.mini th {
		max-width: 6rem;
		overflow: hidden;
		padding: 0.15rem 0.35rem;
		border-bottom: 1px solid var(--line);
		font-weight: 600;
		text-align: left;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--muted);
	}
	.mini th.a-center {
		text-align: center;
	}
	.mini th.a-end {
		text-align: right;
	}
	.mini td {
		max-width: 6rem;
		overflow: hidden;
		padding: 0.14rem 0.35rem;
		border-bottom: 1px solid color-mix(in srgb, var(--line) 55%, transparent);
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.mini .gut {
		display: table-cell;
		width: 0.7rem;
		padding: 0 0.1rem;
		color: var(--c);
		font-family: var(--font-mono);
		font-weight: 700;
		text-align: center;
	}
	.mini tr:not(.c-none) td {
		background: color-mix(in srgb, var(--c) 8%, transparent);
	}
	.mini tr.c-removed td:not(.gut) {
		text-decoration: line-through;
		text-decoration-color: color-mix(in srgb, var(--removed) 70%, transparent);
	}
	.mini .k-number {
		font-size: 0.6rem;
	}
	.more {
		padding: 0.15rem 0.35rem;
		font-size: 0.6rem;
		color: var(--muted);
	}
</style>
