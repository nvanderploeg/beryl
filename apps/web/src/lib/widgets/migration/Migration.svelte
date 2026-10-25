<script lang="ts">
	import type { Cell, MigrationData, MigrationStep } from '../types.ts';
	import type { TypeProps } from '../props.ts';
	import Element from '../Element.svelte';
	import { changeColor, changeSymbol } from '../change.ts';
	import { addCounts, countChanges } from '../shared/counts.ts';
	import { cellKind, cellText } from '../shared/cells.ts';
	import ChangeCounts from '../shared/ChangeCounts.svelte';
	import CodeBlock from '../shared/CodeBlock.svelte';
	import { languageOf } from '../shared/highlight.ts';

	let { data, widget, lod, marks, selected, onselect }: TypeProps<MigrationData> = $props();

	const PREVIEW_STEPS = 6;

	const sqlLanguage = $derived(languageOf(data.dialect) ?? 'sql');
	const previewSteps = $derived(
		data.steps.length > PREVIEW_STEPS ? data.steps.slice(0, PREVIEW_STEPS - 1) : data.steps
	);

	function stepCounts(step: MigrationStep) {
		return addCounts(countChanges(step.columns ?? []), countChanges(step.rows?.items ?? []));
	}

	function differs(before: Cell[] | undefined, values: Cell[], i: number): boolean {
		return before !== undefined && before[i] !== values[i];
	}

	function lineCount(text: string): number {
		return text.replace(/\n$/, '').split('\n').length;
	}

	function plural(n: number, word: string): string {
		return `${n} ${word}${n === 1 ? '' : 's'}`;
	}

	function keepSelection(event: Event) {
		event.stopPropagation();
	}
</script>

{#snippet op(step: MigrationStep)}
	<span class="op op-{step.op}">{step.op}</span>
{/snippet}

{#snippet target(step: MigrationStep)}
	<span class="target">
		{#if step.op === 'rename' && step.to}
			<span class="from">{step.table}</span><span class="arrow">→</span>{step.to}
		{:else}
			{step.table}
		{/if}
	</span>
{/snippet}

{#snippet cell(value: Cell)}
	<span class="v k-{cellKind(value)}">{cellText(value, 'null')}</span>
{/snippet}

{#if lod === 'preview'}
	<div class="frame preview">
		<header class="head">
			<span class="title">{widget.title ?? 'Migration'}</span>
			<span class="meta">
				{#if data.dialect}<span>{data.dialect}</span>{/if}
				<span>{data.steps.length} step{data.steps.length === 1 ? '' : 's'}</span>
			</span>
		</header>
		<ol class="mini">
			{#each previewSteps as step, i (step.key)}
				<li class="mini-step">
					<span class="num">{i + 1}</span>
					{@render op(step)}
					{@render target(step)}
					{#if step.title}<span class="mini-title">{step.title}</span>{/if}
					<span class="mini-end">
						<ChangeCounts counts={stepCounts(step)} />
						{#if step.risk}<span class="dot risk-{step.risk}" title="{step.risk} risk"></span>{/if}
					</span>
				</li>
			{/each}
			{#if previewSteps.length < data.steps.length}
				<li class="mini-more">+{data.steps.length - previewSteps.length} more steps</li>
			{/if}
		</ol>
	</div>
{:else}
	<section class="frame">
		<header class="head">
			<span class="title">{widget.title ?? 'Migration'}</span>
			<span class="meta">
				{#if data.dialect}<span>{data.dialect}</span>{/if}
				<span>{data.steps.length} step{data.steps.length === 1 ? '' : 's'}</span>
			</span>
		</header>
		<ol class="steps">
			{#each data.steps as step, i (step.key)}
				<Element tag="li" key={step.key} {marks} {selected} {onselect} class="step">
					<div class="rail"><span class="num">{i + 1}</span></div>
					<div class="body">
						<div class="shead">
							{@render op(step)}
							{@render target(step)}
							<span class="flags">
								{#if step.risk}
									<span class="risk risk-{step.risk}"
										><span class="dot"></span>{step.risk} risk</span
									>
								{/if}
								{#if step.reversible === true}
									<span class="rev" title="reversible">↺ reversible</span>
								{:else if step.reversible === false}
									<span class="rev one-way" title="cannot be rolled back">irreversible</span>
								{/if}
							</span>
						</div>
						{#if step.title}<div class="stitle">{step.title}</div>{/if}
						{#if step.note}<p class="snote">{step.note}</p>{/if}

						{#if step.columns?.length}
							<div class="part">
								<div class="part-head">
									<span>Columns</span>
									<ChangeCounts counts={countChanges(step.columns)} />
								</div>
								<div class="scroll">
									<div class="cols grid">
										{#each step.columns as column (column.name)}
											<Element
												key="{step.key}.{column.name}"
												change={column.change}
												{marks}
												{selected}
												{onselect}
												class="row {column.change === 'kept' ? 'kept' : ''}"
											>
												<span class="gut">
													{#if column.change !== 'kept'}
														<span
															class="chg"
															style="--c: {changeColor(column.change)}"
															title={column.change}>{changeSymbol(column.change)}</span
														>
													{/if}
												</span>
												<span class="name">{column.name}</span>
												<span class="def">
													{#if column.before !== undefined && column.after !== undefined && column.before !== column.after}
														<span class="was">{column.before}</span>
														<span class="now"><span class="arrow">→</span>{column.after}</span>
													{:else}
														<span class="now">{column.after ?? column.before ?? ''}</span>
													{/if}
													{#if column.note}<span class="cnote">{column.note}</span>{/if}
												</span>
											</Element>
										{/each}
									</div>
								</div>
							</div>
						{/if}

						{#if step.rows}
							{@const rows = step.rows}
							<div class="part">
								<div class="part-head">
									<span>Rows</span>
									<ChangeCounts counts={countChanges(rows.items)} />
								</div>
								<div class="scroll">
									<div class="data grid" style="--n: {rows.columns.length}">
										<div class="row header">
											<span class="gut"></span>
											<span class="th key">key</span>
											{#each rows.columns as name, c (c)}<span class="th">{name}</span>{/each}
										</div>
										{#each rows.items as item (item.key)}
											<Element
												key="{step.key}#{item.key}"
												change={item.change}
												{marks}
												{selected}
												{onselect}
												class="row {item.change === 'kept' ? 'kept' : ''}"
											>
												<span class="gut">
													{#if item.change !== 'kept'}
														<span
															class="chg"
															style="--c: {changeColor(item.change)}"
															title={item.change}>{changeSymbol(item.change)}</span
														>
													{/if}
												</span>
												<span class="td key">{item.key}</span>
												{#each item.values as value, c (c)}
													<span class="td" class:diff={differs(item.before, item.values, c)}>
														{#if item.before && differs(item.before, item.values, c)}
															<span class="was">{@render cell(item.before[c])}</span><span
																class="arrow">→</span
															><span class="now">{@render cell(value)}</span>
														{:else}
															{@render cell(value)}
														{/if}
													</span>
												{/each}
											</Element>
										{/each}
									</div>
								</div>
							</div>
						{/if}

						{#if step.sql}
							<details class="sql">
								<summary onclick={keepSelection} onkeydown={keepSelection}>
									<span class="caret" aria-hidden="true"></span>SQL
									<span class="sql-meta"
										>{data.dialect ?? 'sql'} · {plural(lineCount(step.sql), 'line')}</span
									>
								</summary>
								<CodeBlock code={step.sql} language={sqlLanguage} />
							</details>
						{/if}
					</div>
				</Element>
			{/each}
		</ol>
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
	.from {
		color: var(--muted);
	}
	.arrow {
		margin: 0 0.3em;
		color: var(--changed);
		font-family: var(--font-sans);
	}

	.op {
		--c: var(--muted);
		flex: none;
		padding: 0.05rem 0.35rem;
		border: 1px solid color-mix(in srgb, var(--c) 40%, transparent);
		border-radius: 0.25rem;
		background: color-mix(in srgb, var(--c) 13%, transparent);
		color: var(--c);
		font-family: var(--font-mono);
		font-size: 0.6rem;
		font-weight: 700;
		letter-spacing: 0.05em;
		line-height: 1.35;
		text-transform: uppercase;
	}
	.op-create {
		--c: var(--added);
	}
	.op-drop {
		--c: var(--removed);
	}
	.op-alter,
	.op-rename {
		--c: var(--changed);
	}
	.op-backfill {
		--c: var(--fog);
	}
	.op-data {
		--c: var(--settled);
	}
	.target {
		overflow: hidden;
		font-family: var(--font-mono);
		font-size: 0.78rem;
		font-weight: 650;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.dot {
		display: inline-block;
		flex: none;
		width: 0.42rem;
		height: 0.42rem;
		border-radius: 999px;
		background: var(--c, var(--muted));
	}
	.risk-low {
		--c: var(--settled);
	}
	.risk-medium {
		--c: var(--changed);
	}
	.risk-high {
		--c: var(--removed);
	}

	.steps {
		margin: 0;
		padding: 0.55rem 0.6rem 0.6rem 0.4rem;
		list-style: none;
	}
	.steps :global(.step) {
		display: grid;
		grid-template-columns: 1.7rem minmax(0, 1fr);
		column-gap: 0.45rem;
		padding: 0.25rem 0.3rem 0.65rem 0.2rem;
		border-radius: 0.4rem;
	}
	.steps :global(.step.pw-selectable:not(.pw-selected):has(.pw-selectable:hover)) {
		outline: none;
	}
	.rail {
		position: relative;
		display: flex;
		justify-content: center;
	}
	.steps :global(.step:not(:last-child) > .rail::after) {
		content: '';
		position: absolute;
		top: 1.45rem;
		bottom: -0.9rem;
		left: 50%;
		width: 1px;
		background: var(--line);
	}
	.num {
		display: inline-grid;
		flex: none;
		place-items: center;
		width: 1.25rem;
		height: 1.25rem;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: var(--surface);
		font-family: var(--font-mono);
		font-size: 0.62rem;
		font-weight: 700;
		color: var(--muted);
	}
	.body {
		min-width: 0;
	}
	.shead {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.25rem 0.45rem;
		min-height: 1.25rem;
	}
	.flags {
		display: inline-flex;
		align-items: center;
		gap: 0.6rem;
		margin-left: auto;
		font-size: 0.68rem;
		white-space: nowrap;
		color: var(--muted);
	}
	.risk {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
	}
	.risk-medium.risk,
	.risk-high.risk {
		color: var(--c);
		font-weight: 600;
	}
	.risk .dot {
		background: var(--c);
	}
	.one-way {
		padding: 0 0.3rem;
		border-radius: 0.25rem;
		background: color-mix(in srgb, var(--removed) 12%, transparent);
		color: var(--removed);
		font-weight: 600;
	}
	.stitle {
		margin-top: 0.2rem;
		font-weight: 600;
	}
	.snote {
		margin: 0.15rem 0 0;
		font-size: 0.75rem;
		color: var(--muted);
	}

	.part {
		margin-top: 0.5rem;
	}
	.part-head {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.2rem;
		font-size: 0.6rem;
		font-weight: 600;
		letter-spacing: 0.07em;
		text-transform: uppercase;
		color: var(--muted);
	}
	.part-head :global(.counts) {
		font-size: 0.65rem;
		letter-spacing: 0;
	}
	.scroll {
		overflow-x: auto;
		padding: 0.45rem 0.5rem 0.2rem 0.15rem;
		margin: -0.45rem -0.5rem -0.2rem -0.15rem;
	}
	.grid {
		display: grid;
		width: max-content;
		min-width: 100%;
		border: 1px solid var(--line);
		border-radius: 0.375rem;
		font-size: 0.75rem;
	}
	.grid.cols {
		grid-template-columns: 1.5rem max-content minmax(0, 1fr);
		width: 100%;
	}
	.grid.data {
		grid-template-columns: 1.5rem max-content repeat(var(--n), auto);
	}
	.row,
	.grid :global(.row) {
		display: grid;
		grid-column: 1 / -1;
		grid-template-columns: subgrid;
		align-items: baseline;
		border-bottom: 1px solid color-mix(in srgb, var(--line) 60%, transparent);
	}
	.grid :global(.row:last-child) {
		border-bottom: 0;
		border-radius: 0 0 0.375rem 0.375rem;
	}
	.grid :global(.row:first-child) {
		border-radius: 0.375rem 0.375rem 0 0;
	}
	.grid :global(.row:is(.pw-added, .pw-removed, .pw-changed):not(.pw-selected)) {
		background: color-mix(in srgb, var(--pw-change) 9%, transparent);
		box-shadow: inset 2px 0 0 var(--pw-change);
	}
	.grid :global(.row.kept:not(.pw-selected)) {
		color: var(--muted);
	}
	.grid :global(.row.kept:not(.pw-selected) .v) {
		opacity: 0.75;
	}
	.header {
		border-bottom-color: var(--line);
		background: color-mix(in srgb, var(--surface-2) 50%, var(--surface));
	}
	.gut {
		display: flex;
		align-self: center;
		justify-content: center;
	}
	.name {
		padding: 0.28rem 0.75rem 0.28rem 0.15rem;
		font-family: var(--font-mono);
		font-weight: 600;
		white-space: nowrap;
	}
	.def {
		display: flex;
		flex-direction: column;
		padding: 0.28rem 0.6rem 0.28rem 0;
		font-family: var(--font-mono);
		font-size: 0.7rem;
	}
	.def .was,
	.def .now {
		overflow-wrap: anywhere;
	}
	.def .arrow {
		margin-left: 0;
	}
	.cnote {
		font-family: var(--font-sans);
		font-size: 0.68rem;
		font-style: italic;
		white-space: normal;
		color: var(--muted);
	}
	.was {
		color: var(--muted);
		text-decoration: line-through;
		text-decoration-color: color-mix(in srgb, var(--muted) 60%, transparent);
	}
	.now {
		color: inherit;
	}
	.diff .now {
		color: var(--changed);
		font-weight: 650;
	}
	.th {
		padding: 0.22rem 0.6rem;
		font-family: var(--font-mono);
		font-size: 0.66rem;
		font-weight: 600;
		white-space: nowrap;
		color: var(--muted);
	}
	.td {
		padding: 0.26rem 0.6rem;
		font-family: var(--font-mono);
		font-size: 0.7rem;
		white-space: nowrap;
	}
	.th.key,
	.td.key {
		padding-left: 0.15rem;
		color: var(--muted);
	}
	.td.key {
		font-size: 0.65rem;
	}
	.k-number {
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
		font-style: italic;
		color: color-mix(in srgb, var(--muted) 60%, transparent);
	}

	.sql {
		margin-top: 0.5rem;
	}
	.sql summary {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.1rem 0.4rem 0.1rem 0.25rem;
		border-radius: 0.25rem;
		font-size: 0.68rem;
		font-weight: 600;
		letter-spacing: 0.06em;
		list-style: none;
		cursor: pointer;
		color: var(--muted);
	}
	.sql summary::-webkit-details-marker {
		display: none;
	}
	.sql summary:hover {
		background: var(--surface-2);
		color: var(--ink);
	}
	.caret {
		width: 0;
		height: 0;
		border-top: 0.25rem solid transparent;
		border-bottom: 0.25rem solid transparent;
		border-left: 0.35rem solid currentColor;
		transition: transform 120ms;
	}
	.sql[open] .caret {
		transform: rotate(90deg);
	}
	.sql-meta {
		font-weight: 400;
		letter-spacing: 0;
		color: color-mix(in srgb, var(--muted) 80%, transparent);
	}
	.sql :global(.codeblock) {
		margin-top: 0.3rem;
	}

	.mini {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		margin: 0;
		padding: 0.4rem 0.55rem;
		list-style: none;
	}
	.mini-step {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		min-width: 0;
		height: 1.3rem;
		font-size: 0.68rem;
	}
	.mini .num {
		width: 1rem;
		height: 1rem;
		font-size: 0.55rem;
	}
	.mini .op {
		font-size: 0.52rem;
		padding: 0 0.25rem;
	}
	.mini .target {
		flex: none;
		max-width: 7rem;
		font-size: 0.66rem;
	}
	.mini-title {
		overflow: hidden;
		min-width: 0;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--muted);
	}
	.mini-end {
		display: inline-flex;
		flex: none;
		align-items: center;
		gap: 0.35rem;
		margin-left: auto;
		font-size: 0.62rem;
	}
	.mini-more {
		padding-left: 1.35rem;
		font-size: 0.62rem;
		color: var(--muted);
	}
</style>
