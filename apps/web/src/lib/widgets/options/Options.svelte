<script lang="ts">
	import type { OptionDef, OptionsData } from '../types.ts';
	import type { TypeProps } from '../props.ts';
	import Element from '../Element.svelte';
	import Frame from '../shared/Frame.svelte';
	import { scoreTone, scoreText } from './score.ts';

	let { data, widget, lod, marks, selected, onselect }: TypeProps<OptionsData> = $props();

	const criteria = $derived(data.criteria ?? []);
	const decided = $derived(data.options.some((o) => o.chosen));
	const recedes = (o: OptionDef) => decided && !o.chosen;

	const PREVIEW_ROWS = 6;
	const rows = $derived(PREVIEW_ROWS - (data.question ? 1 : 0));
	const visible = $derived(
		data.options.length > rows ? data.options.slice(0, rows - 1) : data.options
	);
	const hidden = $derived(data.options.length - visible.length);
</script>

{#snippet marksOf(o: OptionDef)}
	{#if o.chosen}<span class="chosen-mark" title="Chosen">✓</span>{/if}
	{#if o.recommended}<span class="rec-mark" title="Recommended">★</span>{/if}
{/snippet}

<Frame
	title={widget.title ?? 'Options'}
	{lod}
	meta="{data.options.length} option{data.options.length === 1 ? '' : 's'}"
>
	{#if lod === 'preview'}
		<div class="mini">
			{#if data.question}<p class="mini-question">{data.question}</p>{/if}
			<ul>
				{#each visible as o (o.key)}
					<li>
						<Element key={o.key} {marks} class="mini-row {o.chosen ? 'is-chosen' : ''}">
							<span class="mini-body" class:recede={recedes(o)}>
								<span class="mini-marks">{@render marksOf(o)}</span>
								<span class="mini-title">{o.title}</span>
								{#if criteria.length}
									<span class="strip" aria-hidden="true">
										{#each criteria as c (c.key)}
											<i class="sq tone-{scoreTone(o.scores?.[c.key])}"></i>
										{/each}
									</span>
								{:else if o.pros?.length || o.cons?.length}
									<span class="mini-count">
										<span class="pro">+{o.pros?.length ?? 0}</span>
										<span class="con">−{o.cons?.length ?? 0}</span>
									</span>
								{/if}
							</span>
						</Element>
					</li>
				{/each}
			</ul>
			{#if hidden > 0}<p class="more">+{hidden} more</p>{/if}
		</div>
	{:else}
		<div class="full">
			{#if data.question}<p class="question">{data.question}</p>{/if}

			{#if criteria.length}
				<div class="matrix-wrap">
					<table class="matrix">
						<thead>
							<tr>
								<th class="corner"></th>
								{#each data.options as o (o.key)}
									<th class="col-head" class:recede={recedes(o)} class:is-chosen={o.chosen}>
										<span class="col-marks">{@render marksOf(o)}</span>{o.title}
									</th>
								{/each}
							</tr>
						</thead>
						<tbody>
							{#each criteria as c (c.key)}
								<tr>
									<th scope="row" class="row-head">{c.label}</th>
									{#each data.options as o (o.key)}
										{@const score = o.scores?.[c.key]}
										<td class:is-chosen={o.chosen}>
											<Element key="{o.key}.{c.key}" {marks} {selected} {onselect} class="cell">
												<span
													class="chip tone-{scoreTone(score)}"
													class:recede={recedes(o)}
													title={score}
												>
													{scoreText(score)}
												</span>
											</Element>
										</td>
									{/each}
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}

			<div class="cards">
				{#each data.options as o (o.key)}
					<Element
						key={o.key}
						{marks}
						{selected}
						{onselect}
						class="card {o.chosen ? 'is-chosen' : ''} {o.recommended ? 'is-rec' : ''} {recedes(o)
							? 'receded'
							: ''}"
					>
						<div class="card-body" class:recede={recedes(o)}>
							<div class="card-head">
								<span class="card-title">{o.title}</span>
								{#if o.chosen}<span class="badge chosen-badge">✓ Chosen</span>{/if}
								{#if o.recommended}<span class="badge rec-badge">★ Recommended</span>{/if}
							</div>
							{#if o.summary}<p class="summary">{o.summary}</p>{/if}
							{#if o.pros?.length}
								<ul class="list">
									{#each o.pros as pro, i (i)}
										<li><span class="sym pro">+</span>{pro}</li>
									{/each}
								</ul>
							{/if}
							{#if o.cons?.length}
								<ul class="list">
									{#each o.cons as con, i (i)}
										<li><span class="sym con">−</span>{con}</li>
									{/each}
								</ul>
							{/if}
						</div>
					</Element>
				{/each}
			</div>
		</div>
	{/if}
</Frame>

<style>
	.chosen-mark {
		color: var(--settled);
		font-weight: 700;
	}
	.rec-mark {
		color: var(--accent);
	}

	/* preview */
	.mini {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		padding: 0.45rem 0.6rem;
		height: 100%;
		box-sizing: border-box;
		overflow: hidden;
	}
	.mini-question {
		margin: 0;
		font-size: 0.75rem;
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.mini ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}
	.mini :global(.mini-row) {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		height: 1.3rem;
		padding: 0 0.4rem;
		border: 1px solid var(--line);
		border-radius: 0.35rem;
		font-size: 0.72rem;
	}
	.mini :global(.mini-row.is-chosen) {
		border-color: color-mix(in srgb, var(--settled) 70%, var(--line));
		background: color-mix(in srgb, var(--settled) 8%, transparent);
		font-weight: 600;
	}
	.mini :global(.mini-row:has(> .pw-mark)) {
		padding-right: 1.5rem;
	}
	.mini :global(.mini-row .pw-mark) {
		top: 50%;
		right: 0.15rem;
		transform: translateY(-50%) scale(0.85);
	}
	.mini-body {
		display: flex;
		flex: 1;
		align-items: center;
		gap: 0.4rem;
		min-width: 0;
	}
	.mini-marks {
		display: inline-flex;
		justify-content: center;
		gap: 0.1rem;
		min-width: 0.8rem;
		font-size: 0.7rem;
	}
	.mini-title {
		flex: 1;
		min-width: 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.strip {
		display: inline-flex;
		gap: 2px;
	}
	.sq {
		display: block;
		width: 0.55rem;
		height: 0.55rem;
		border-radius: 2px;
	}
	.mini-count {
		display: inline-flex;
		gap: 0.3rem;
		font-family: var(--font-mono);
		font-size: 0.65rem;
	}
	.more {
		margin: 0;
		font-size: 0.65rem;
		color: var(--muted);
	}

	/* full */
	.full {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 0.75rem;
	}
	.question {
		margin: 0;
		font-size: 0.9rem;
		font-weight: 600;
	}
	.matrix-wrap {
		overflow-x: auto;
		border: 1px solid var(--line);
		border-radius: 0.5rem;
	}
	.matrix {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.75rem;
	}
	.matrix th,
	.matrix td {
		padding: 0.35rem 0.5rem;
		border-bottom: 1px solid var(--line);
		text-align: center;
		vertical-align: middle;
	}
	.matrix tbody tr:last-child th,
	.matrix tbody tr:last-child td {
		border-bottom: none;
	}
	.matrix thead th {
		background: var(--surface-2);
		font-weight: 600;
		line-height: 1.25;
	}
	.col-marks {
		margin-right: 0.25rem;
	}
	.matrix .row-head {
		text-align: left;
		font-weight: 500;
		color: var(--muted);
		white-space: nowrap;
	}
	.matrix td.is-chosen,
	.matrix th.is-chosen {
		background: color-mix(in srgb, var(--settled) 8%, transparent);
	}
	.matrix thead th.is-chosen {
		background: color-mix(in srgb, var(--settled) 14%, var(--surface-2));
	}
	.matrix :global(.cell) {
		display: inline-block;
		border-radius: 999px;
	}
	.chip {
		display: inline-block;
		min-width: 1.9rem;
		padding: 0.1rem 0.45rem;
		border-radius: 999px;
		font-family: var(--font-mono);
		font-size: 0.72rem;
		font-weight: 600;
		line-height: 1.3;
		white-space: nowrap;
		max-width: 9rem;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.tone-pp {
		background: color-mix(in srgb, var(--added) 40%, transparent);
		color: color-mix(in srgb, var(--added) 55%, var(--ink));
	}
	.tone-p {
		background: color-mix(in srgb, var(--added) 16%, transparent);
		color: color-mix(in srgb, var(--added) 75%, var(--ink));
	}
	.tone-z {
		background: var(--surface-2);
		color: var(--muted);
	}
	.tone-m {
		background: color-mix(in srgb, var(--removed) 16%, transparent);
		color: color-mix(in srgb, var(--removed) 75%, var(--ink));
	}
	.tone-mm {
		background: color-mix(in srgb, var(--removed) 40%, transparent);
		color: color-mix(in srgb, var(--removed) 55%, var(--ink));
	}
	.tone-text {
		background: var(--surface-2);
		color: var(--ink);
		font-family: var(--font-sans);
		font-weight: 500;
	}
	.tone-none {
		color: var(--muted);
		font-weight: 400;
	}
	.sq.tone-pp {
		background: var(--added);
	}
	.sq.tone-p {
		background: color-mix(in srgb, var(--added) 45%, transparent);
	}
	.sq.tone-z,
	.sq.tone-text {
		background: color-mix(in srgb, var(--muted) 35%, transparent);
	}
	.sq.tone-m {
		background: color-mix(in srgb, var(--removed) 45%, transparent);
	}
	.sq.tone-mm {
		background: var(--removed);
	}
	.sq.tone-none {
		background: transparent;
		box-shadow: inset 0 0 0 1px var(--line);
	}

	.cards {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(11.5rem, 1fr));
		gap: 0.6rem;
	}
	.cards :global(.card) {
		padding: 0.55rem 0.65rem 0.6rem;
		border: 1px solid var(--line);
		border-radius: 0.5rem;
		background: var(--surface);
		font-size: 0.75rem;
		transition: opacity 120ms;
	}
	.cards :global(.card.is-rec) {
		border-color: color-mix(in srgb, var(--accent) 45%, var(--line));
	}
	.cards :global(.card.is-chosen) {
		border-color: var(--settled);
		box-shadow: inset 0 0 0 1px var(--settled);
		background: color-mix(in srgb, var(--settled) 6%, var(--surface));
	}
	.cards :global(.card.pw-selected) {
		background: color-mix(in srgb, var(--accent) 8%, var(--surface));
	}
	.card-body {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.cards :global(.card.receded) {
		border-color: color-mix(in srgb, var(--line) 60%, transparent);
	}
	.card-head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.3rem 0.4rem;
	}
	.card-title {
		flex: 1 1 auto;
		font-size: 0.82rem;
		font-weight: 600;
		line-height: 1.25;
	}
	.badge {
		flex: none;
		padding: 0.05rem 0.4rem;
		border-radius: 999px;
		font-size: 0.62rem;
		font-weight: 600;
		letter-spacing: 0.02em;
		white-space: nowrap;
	}
	.rec-badge {
		color: var(--accent);
		background: color-mix(in srgb, var(--accent) 12%, transparent);
	}
	.chosen-badge {
		color: var(--settled);
		background: color-mix(in srgb, var(--settled) 14%, transparent);
	}
	.summary {
		margin: 0;
		color: var(--muted);
		line-height: 1.4;
	}
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		line-height: 1.35;
	}
	.list li {
		display: flex;
		gap: 0.35rem;
	}
	.sym {
		flex: none;
		width: 0.7rem;
		font-family: var(--font-mono);
		font-weight: 700;
		text-align: center;
	}
	.pro {
		color: var(--added);
	}
	.con {
		color: var(--removed);
	}

	.recede {
		opacity: 0.5;
	}
	:global(.receded:hover) .recede,
	:global(.receded.pw-selected) .recede,
	:global(.cell:hover) .recede,
	:global(.cell.pw-selected) .recede {
		opacity: 0.85;
	}
</style>
