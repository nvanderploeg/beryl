<script lang="ts">
	import { onMount } from 'svelte';
	import type { SchemaData } from '../types.ts';
	import type { TypeProps } from '../props.ts';
	import Element from '../Element.svelte';
	import { changeColor, changeSymbol } from '../change.ts';
	import { layoutGraph, type LayoutResult } from '../elk.ts';
	import { countChanges } from '../shared/counts.ts';
	import ChangeCounts from '../shared/ChangeCounts.svelte';
	import {
		buildModel,
		CHG_W,
		DEFAULT_MONO,
		HEAD_H,
		INDEX_H,
		INDEX_PAD,
		KEYS_W,
		NOTE_H,
		NULL_W,
		ROW_H,
		routeFk,
		stack,
		type Card,
		type Rect,
		type SchemaModel
	} from './model.ts';

	let { data, widget, lod, marks, selected, onselect }: TypeProps<SchemaData> = $props();

	const EDGE = 10;
	const ELK_OPTIONS = {
		'elk.direction': 'RIGHT',
		'elk.spacing.nodeNode': '28',
		'elk.layered.spacing.nodeNodeBetweenLayers': '56',
		'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
		'elk.padding': '[top=10,left=10,bottom=10,right=10]'
	};

	let mono = $state(DEFAULT_MONO);
	let available = $state(0);

	onMount(() => {
		const measure = () => {
			const probe = document.createElement('span');
			probe.style.cssText =
				'position:absolute;visibility:hidden;white-space:pre;font-size:100px;font-family:var(--font-mono)';
			probe.textContent = '0123456789';
			document.body.append(probe);
			const ratio = probe.getBoundingClientRect().width / 1000;
			probe.remove();
			if (ratio > 0.3 && ratio < 1) mono = ratio;
		};
		measure();
		document.fonts?.ready.then(measure);
	});

	const model = $derived(buildModel(data, mono));
	const cards = $derived(new Map(model.cards.map((c) => [c.id, c])));
	const tableCounts = $derived(countChanges(data.tables));

	let layered = $state.raw<{ model: SchemaModel; result: LayoutResult } | null>(null);

	$effect(() => {
		if (lod !== 'full') return;
		const current = model;
		let live = true;
		layoutGraph(
			current.cards.map((c) => ({ id: c.id, width: c.width, height: c.height })),
			current.fks
				.filter((fk) => fk.from.card !== fk.to.card)
				.map((fk) => ({ id: fk.id, source: fk.to.card, target: fk.from.card })),
			ELK_OPTIONS
		).then((result) => {
			if (live) layered = { model: current, result };
		});
		return () => {
			live = false;
		};
	});

	function arrange(boxes: Record<string, Rect>, height: number) {
		const routes = model.fks.flatMap((fk) => {
			const src = boxes[fk.from.card];
			const dst = boxes[fk.to.card];
			const srcCard = cards.get(fk.from.card);
			const dstCard = cards.get(fk.to.card);
			if (!src || !dst || !srcCard || !dstCard) return [];
			const route = routeFk(src, srcCard, fk.from.row, dst, dstCard, fk.to.row);
			return [{ ...fk, ...route, from: srcCard.name, to: dstCard.rows[fk.to.row]?.name }];
		});
		const width = Math.max(
			...Object.values(boxes).map((b) => b.x + b.width),
			...routes.map((r) => r.right)
		);
		return { boxes, routes, width: Math.ceil(width + EDGE), height: Math.ceil(height) };
	}

	const placed = $derived.by(() => {
		if (!layered || layered.model !== model) return null;
		const wide = arrange(layered.result.boxes, layered.result.height);
		if (!available || wide.width <= available) return wide;
		const boxes = layered.result.boxes;
		const order = (id: string) => (boxes[id]?.x ?? 0) * 10000 + (boxes[id]?.y ?? 0);
		const column = stack(model.cards, order);
		return arrange(column.boxes, column.height);
	});

	const isActive = (route: { element: string; from: string; target: string; to?: string }) =>
		selected != null &&
		(selected === route.element ||
			selected === route.from ||
			selected === route.target ||
			selected === `${route.target}.${route.to}`);

	const detail = $derived.by(() => {
		if (!selected) return null;
		for (const t of data.tables) {
			if (selected === t.name) {
				const was = t.change === 'renamed' && t.from ? `renamed from ${t.from}` : t.change;
				return {
					key: t.name,
					parts: [plural(t.columns.length, 'column'), was, t.note]
				};
			}
			for (const c of t.columns) {
				if (selected !== `${t.name}.${c.name}`) continue;
				const was = c.change === 'renamed' && c.from ? `renamed from ${c.from}` : c.change;
				return {
					key: selected,
					parts: [
						c.default !== undefined ? `${c.type} default ${c.default}` : c.type,
						c.pk && 'primary key',
						c.unique && 'unique',
						c.nullable ? 'nullable' : 'not null',
						c.references && `→ ${c.references.table}.${c.references.column}`,
						was,
						c.note
					]
				};
			}
			for (const i of t.indexes ?? []) {
				if (selected !== `${t.name}#${i.name}`) continue;
				return {
					key: selected,
					parts: [`(${i.columns.join(', ')})`, i.unique ? 'unique index' : 'index', i.change]
				};
			}
		}
		return null;
	});

	function plural(n: number, word: string): string {
		return `${n} ${word}${n === 1 ? '' : 's'}`;
	}

	const notes = $derived(
		data.tables.flatMap((t) =>
			t.columns.filter((c) => c.note).map((c) => ({ key: `${t.name}.${c.name}`, note: c.note }))
		)
	);

	function position(card: Card): string {
		const box = placed?.boxes[card.id];
		const where = box ? `left: ${box.x}px; top: ${box.y}px;` : '';
		return `${where} width: ${card.width}px; height: ${card.height}px;`;
	}

	function columnsTemplate(card: Card): string {
		return [
			`${KEYS_W}px`,
			`${card.nameW}px`,
			'minmax(0, 1fr)',
			card.nullable ? `${NULL_W}px` : '',
			card.changes ? `${CHG_W}px` : ''
		].join(' ');
	}

	const PREVIEW_ROWS = 3;
	const previewColumns = $derived(data.tables.length > 2 * PREVIEW_ROWS ? 3 : 2);
	const previewCapacity = $derived(previewColumns * PREVIEW_ROWS);
	const previewTables = $derived(
		data.tables.length > previewCapacity ? data.tables.slice(0, previewCapacity - 1) : data.tables
	);
	const refs = $derived(model.fks.length);
</script>

{#if lod === 'preview'}
	<div class="frame preview">
		<header class="head">
			<span class="title">{widget.title ?? 'Schema'}</span>
			<span class="meta">
				<ChangeCounts counts={tableCounts} />
				<span>{data.tables.length} table{data.tables.length === 1 ? '' : 's'}</span>
			</span>
		</header>
		<div class="chips" style="--cols: {previewColumns}">
			{#each previewTables as table (table.name)}
				{@const counts = countChanges(table.columns)}
				<div class="tchip" class:tinted={!!table.change} style="--c: {changeColor(table.change)}">
					<span class="tchip-name">
						{#if table.change}<span class="chg sm">{changeSymbol(table.change)}</span>{/if}
						<span class="tn" class:struck={table.change === 'removed'}>{table.name}</span>
					</span>
					<span class="tchip-meta">
						<span>{table.columns.length} col{table.columns.length === 1 ? '' : 's'}</span>
						{#if table.change !== 'added' && table.change !== 'removed'}
							<ChangeCounts {counts} />
						{/if}
					</span>
				</div>
			{/each}
			{#if previewTables.length < data.tables.length}
				<div class="tchip more">+{data.tables.length - previewTables.length} more</div>
			{/if}
		</div>
	</div>
{:else}
	<section class="frame">
		<header class="head">
			<span class="title">{widget.title ?? 'Schema'}</span>
			<span class="meta">
				<ChangeCounts counts={tableCounts} />
				<span>{data.tables.length} table{data.tables.length === 1 ? '' : 's'}</span>
				{#if refs}<span>{refs} ref{refs === 1 ? '' : 's'}</span>{/if}
			</span>
		</header>
		<div class="scroll" bind:clientWidth={available}>
			<div
				class="canvas"
				class:placed={!!placed}
				style={placed ? `width: ${placed.width}px; height: ${placed.height}px;` : ''}
				style:--head-h="{HEAD_H}px"
				style:--note-h="{NOTE_H}px"
				style:--row-h="{ROW_H}px"
				style:--index-h="{INDEX_H}px"
				style:--index-pad="{INDEX_PAD}px"
			>
				{#if placed}
					<svg class="links" width={placed.width} height={placed.height} aria-hidden="true">
						{#each placed.routes as route (route.id)}
							<g
								class="rel"
								class:active={isActive(route)}
								class:removed={route.change === 'removed'}
								style="--c: {changeColor(route.change) ?? 'var(--muted)'}"
							>
								<path d={route.d} />
								<path d={route.many} />
								<path d={route.one} />
							</g>
						{/each}
					</svg>
				{/if}
				{#each model.cards as card (card.id)}
					<div class="slot" class:stub={!card.table} style={position(card)}>
						{#if card.table}
							{@const table = card.table}
							<Element
								key={table.name}
								change={table.change}
								{marks}
								{selected}
								{onselect}
								class="card"
							>
								<div class="thead">
									{#if table.change}
										<span class="chg" style="--c: {changeColor(table.change)}" title={table.change}
											>{changeSymbol(table.change)}</span
										>
									{/if}
									<span class="tname">
										{#if table.change === 'renamed' && table.from}
											<span class="from">{table.from}</span><span class="arrow">→</span>
										{/if}{table.name}
									</span>
									<span class="tcount">{table.columns.length}</span>
								</div>
								{#if table.note}
									<div class="tnote" title={table.note}>{table.note}</div>
								{/if}
								<div class="cols" style="--template: {columnsTemplate(card)}">
									{#each table.columns as column, i (column.name)}
										{@const change = card.rows[i].change}
										<Element
											key="{table.name}.{column.name}"
											{change}
											{marks}
											{selected}
											{onselect}
											class="col"
										>
											<span class="keys">
												{#if column.pk}<span class="k pk" title="primary key">PK</span>{/if}
												{#if column.references}
													<span
														class="k fk"
														title="references {column.references.table}.{column.references.column}"
														>FK</span
													>
												{/if}
												{#if column.unique && !column.pk}<span class="k uq" title="unique">UQ</span
													>{/if}
											</span>
											<span class="cname" title={column.note}>
												{#if column.change === 'renamed' && column.from}
													<span class="from">{column.from}</span><span class="arrow">→</span>
												{/if}{column.name}{#if column.note}<sup class="noted">*</sup>{/if}
											</span>
											<span class="ctype" title={column.type}>
												{column.type}{#if column.default !== undefined}<span class="def">
														= {column.default}</span
													>{/if}
											</span>
											{#if card.nullable}
												<span class="cnull">{column.nullable ? 'null' : ''}</span>
											{/if}
											{#if card.changes}
												<span class="cchg">
													{#if change}
														<span class="chg sm" style="--c: {changeColor(change)}" title={change}
															>{changeSymbol(change)}</span
														>
													{/if}
												</span>
											{/if}
										</Element>
									{/each}
								</div>
								{#if table.indexes?.length}
									<div class="indexes">
										{#each table.indexes as index (index.name)}
											<Element
												key="{table.name}#{index.name}"
												change={index.change}
												{marks}
												{selected}
												{onselect}
												class="index"
											>
												<span class="itag">{index.unique ? 'UNIQ' : 'IDX'}</span>
												<span class="iname">{index.name}</span>
												<span class="icols">({index.columns.join(', ')})</span>
												{#if index.change}
													<span
														class="chg sm"
														style="--c: {changeColor(index.change)}"
														title={index.change}>{changeSymbol(index.change)}</span
													>
												{/if}
											</Element>
										{/each}
									</div>
								{/if}
							</Element>
						{:else}
							<div class="card stub-card" title="{card.name} is not part of this widget">
								<div class="thead"><span class="tname">{card.name}</span></div>
								<div class="cols" style="--template: 36px {card.nameW}px">
									{#each card.rows as row (row.name)}
										<div class="col">
											<span class="keys"></span><span class="cname">{row.name}</span>
										</div>
									{/each}
								</div>
							</div>
						{/if}
					</div>
				{/each}
			</div>
		</div>
		{#if detail}
			<div class="detail">
				<code>{detail.key}</code>
				{#each detail.parts.filter(Boolean) as part, i (i)}<span>{part}</span>{/each}
			</div>
		{/if}
		{#if notes.length}
			<ul class="notes">
				{#each notes as n (n.key)}
					<li><code>{n.key}</code> {n.note}</li>
				{/each}
			</ul>
		{/if}
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
		width: 0.9rem;
		height: 0.9rem;
		font-size: 0.65rem;
	}
	.from {
		color: var(--muted);
		font-weight: 400;
	}
	.cname .from {
		font-size: 10.5px;
	}
	.arrow {
		margin: 0 0.25em;
		color: var(--changed);
		font-weight: 400;
	}

	.scroll {
		overflow: auto;
		padding: 0.25rem 0.35rem;
	}
	.canvas {
		position: relative;
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
		padding: 10px;
	}
	.canvas.placed {
		display: block;
		padding: 0;
	}
	.links {
		position: absolute;
		inset: 0;
		overflow: visible;
		pointer-events: none;
	}
	.rel path {
		fill: none;
		stroke: color-mix(in srgb, var(--c) 75%, transparent);
		stroke-width: 1.25;
	}
	.rel.removed path:first-child {
		stroke-dasharray: 4 3;
	}
	.rel.active path {
		stroke: var(--accent);
		stroke-width: 2;
	}
	.slot {
		position: relative;
		flex: none;
		box-sizing: border-box;
		border-radius: 0.5rem;
		background: var(--surface);
	}
	.placed .slot {
		position: absolute;
	}
	.slot :global(.card) {
		box-sizing: border-box;
		height: 100%;
		border: 1px solid var(--line);
		border-radius: 0.5rem;
		font-family: var(--font-mono);
	}
	.slot :global(.card:is(.pw-added, .pw-removed, .pw-changed)) {
		border-color: color-mix(in srgb, var(--pw-change) 55%, var(--line));
	}
	.slot :global(.card.pw-selectable:not(.pw-selected):has(.pw-selectable:hover)) {
		outline: none;
	}
	.stub-card {
		border-style: dashed !important;
		color: var(--muted);
		opacity: 0.85;
	}
	.thead {
		display: flex;
		box-sizing: border-box;
		align-items: center;
		gap: 0.4rem;
		height: var(--head-h);
		padding: 0 8px;
		border-bottom: 1px solid var(--line);
		border-radius: 0.5rem 0.5rem 0 0;
		background: color-mix(in srgb, var(--surface-2) 70%, var(--surface));
	}
	.slot :global(.card:is(.pw-added, .pw-removed, .pw-changed) > .thead) {
		border-bottom-color: color-mix(in srgb, var(--pw-change) 35%, var(--line));
		background: color-mix(in srgb, var(--pw-change) 12%, var(--surface));
	}
	.stub-card .thead {
		background: none;
		border-bottom-style: dashed;
	}
	.tname {
		overflow: hidden;
		min-width: 0;
		font-size: 12.5px;
		font-weight: 700;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.tcount {
		margin-left: auto;
		font-size: 10px;
		color: var(--muted);
	}
	.tnote {
		box-sizing: border-box;
		height: var(--note-h);
		overflow: hidden;
		padding: 0 8px;
		border-bottom: 1px solid color-mix(in srgb, var(--line) 60%, transparent);
		font-family: var(--font-sans);
		font-size: 10.5px;
		font-style: italic;
		line-height: var(--note-h);
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--muted);
	}
	.cols :global(.col),
	.col {
		display: grid;
		box-sizing: border-box;
		grid-template-columns: var(--template);
		align-items: center;
		height: var(--row-h);
		padding: 0 8px;
		font-size: 12px;
		white-space: nowrap;
	}
	.cols :global(.col:is(.pw-added, .pw-removed, .pw-changed):not(.pw-selected)) {
		background: color-mix(in srgb, var(--pw-change) 9%, transparent);
		box-shadow: inset 2px 0 0 var(--pw-change);
	}
	.keys {
		display: flex;
		gap: 2px;
	}
	.k {
		padding: 0 2px;
		border-radius: 3px;
		font-size: 8px;
		font-weight: 700;
		line-height: 12px;
		letter-spacing: 0.02em;
		text-decoration: none;
	}
	.pk {
		background: color-mix(in srgb, var(--accent) 18%, transparent);
		color: var(--accent);
	}
	.fk {
		background: color-mix(in srgb, var(--fog) 20%, transparent);
		color: var(--fog);
	}
	.uq {
		background: color-mix(in srgb, var(--settled) 18%, transparent);
		color: var(--settled);
	}
	.cname {
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.noted {
		margin-left: 1px;
		color: var(--accent);
		font-weight: 700;
	}
	.ctype {
		overflow: hidden;
		padding-left: 12px;
		font-size: 11px;
		text-overflow: ellipsis;
		color: var(--muted);
	}
	.def {
		color: color-mix(in srgb, var(--muted) 65%, transparent);
	}
	.cnull {
		font-size: 9.5px;
		text-align: right;
		color: color-mix(in srgb, var(--muted) 75%, transparent);
	}
	.cchg {
		display: flex;
		justify-content: flex-end;
	}
	.indexes {
		padding: var(--index-pad) 0;
		border-top: 1px solid var(--line);
	}
	.indexes :global(.index) {
		display: flex;
		box-sizing: border-box;
		align-items: center;
		gap: 0.35rem;
		height: var(--index-h);
		padding: 0 8px;
		font-size: 10px;
		white-space: nowrap;
		color: var(--muted);
	}
	.indexes :global(.index:is(.pw-added, .pw-removed, .pw-changed):not(.pw-selected)) {
		background: color-mix(in srgb, var(--pw-change) 9%, transparent);
		box-shadow: inset 2px 0 0 var(--pw-change);
	}
	.itag {
		font-size: 8px;
		font-weight: 700;
		letter-spacing: 0.04em;
		color: color-mix(in srgb, var(--muted) 80%, transparent);
	}
	.iname {
		color: var(--ink);
	}
	.icols {
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.indexes .chg {
		margin-left: auto;
	}
	.slot :global(.card.pw-removed :is(.tname, .cname, .ctype, .iname, .icols)) {
		text-decoration: line-through;
		text-decoration-color: color-mix(in srgb, var(--removed) 70%, transparent);
	}
	.detail {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.2rem 0.5rem;
		padding: 0.4rem 0.75rem;
		border-top: 1px solid var(--line);
		background: color-mix(in srgb, var(--accent) 6%, var(--surface));
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--muted);
	}
	.detail code {
		font-weight: 700;
		color: var(--accent);
	}
	.detail span + span::before {
		content: '·';
		margin-right: 0.5rem;
		color: color-mix(in srgb, var(--muted) 60%, transparent);
	}
	.notes {
		margin: 0;
		padding: 0.45rem 0.75rem 0.55rem;
		border-top: 1px solid var(--line);
		list-style: none;
		font-size: 0.72rem;
		color: var(--muted);
	}
	.notes li::before {
		content: '* ';
		color: var(--accent);
		font-weight: 700;
	}
	.notes code {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: var(--ink);
	}

	.chips {
		display: grid;
		grid-template-columns: repeat(var(--cols), minmax(0, 1fr));
		gap: 6px;
		padding: 8px;
	}
	.tchip {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
		padding: 5px 7px;
		border: 1px solid var(--line);
		border-radius: 0.375rem;
		background: color-mix(in srgb, var(--surface-2) 45%, var(--surface));
	}
	.tchip.tinted {
		border-color: color-mix(in srgb, var(--c) 50%, var(--line));
		background: color-mix(in srgb, var(--c) 10%, var(--surface));
	}
	.tchip-name {
		display: flex;
		align-items: center;
		gap: 4px;
		min-width: 0;
		font-family: var(--font-mono);
		font-size: 11px;
		font-weight: 700;
	}
	.tn {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.struck {
		text-decoration: line-through;
		text-decoration-color: color-mix(in srgb, var(--removed) 70%, transparent);
	}
	.tchip-meta {
		display: flex;
		gap: 6px;
		font-size: 9.5px;
		color: var(--muted);
	}
	.tchip.more {
		justify-content: center;
		align-items: center;
		border-style: dashed;
		font-size: 10px;
		color: var(--muted);
	}
</style>
