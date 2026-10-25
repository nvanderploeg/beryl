<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import type { ClassDef, ClassesData, ClassRelationKind, Visibility } from '../types.ts';
	import type { TypeProps } from '../props.ts';
	import Element from '../Element.svelte';
	import { changeColor, changeSymbol } from '../change.ts';
	import Frame from '../shared/Frame.svelte';
	import ChangeMark from '../shared/ChangeMark.svelte';
	import Stage from '../shared/Stage.svelte';
	import SvgElement from '../shared/SvgElement.svelte';
	import { textWidth, withMark } from '../shared/text.ts';
	import {
		along,
		bounds,
		diamond,
		direction,
		midpoint,
		openArrow,
		polyline,
		triangle,
		type Box,
		type Point
	} from '../shared/geometry.ts';
	import { endpoints, layout, reversed, type GraphEdge, type RoutedEdge } from '../shared/graph.ts';
	import { measured } from '../shared/measure.svelte.ts';
	import { relationKeys } from './elements.ts';

	let { data, widget, lod, marks, selected, onselect }: TypeProps<ClassesData> = $props();

	const full = $derived(lod === 'full');
	const select = $derived(full ? onselect : undefined);
	const LABEL = { size: 11 };
	const CARD = { size: 10, mono: true };
	const PAD = 10;

	const visibilityName: Record<Visibility, string> = {
		'+': 'public',
		'-': 'private',
		'#': 'protected',
		'~': 'package'
	};

	const ids = $derived(new Map(data.classes.map((c) => [c.key, `c:${c.key}`])));
	const relations = $derived.by(() => {
		const all = data.relations ?? [];
		const keys = relationKeys(all);
		return all
			.map((r, i) => ({ ...r, id: `r${i}`, element: keys[i] }))
			.filter((r) => ids.has(r.from) && ids.has(r.to));
	});

	// UML puts the supertype above: lay these out from `to` down to `from`.
	const upward = (kind: ClassRelationKind) => kind === 'inherits' || kind === 'implements';
	const dashed = (kind: ClassRelationKind) => kind === 'implements' || kind === 'uses';

	let live = $state(false);
	const boxes = measured();
	const sizes = boxes.sizes;
	onMount(() => (live = true));
	onDestroy(() => boxes.disconnect());

	interface Head {
		d: string;
		fill: 'none' | 'solid' | 'hollow';
	}
	interface DrawnRelation {
		d: string[];
		heads: Head[];
		label?: Box;
		mid: Point;
		cards: { text: string; x: number; y: number; anchor: 'start' | 'middle' | 'end' }[];
	}
	interface Drawn {
		width: number;
		height: number;
		dx: number;
		dy: number;
		boxes: Record<string, Box>;
		relations: Record<string, DrawnRelation>;
	}

	let drawn = $state<Drawn | null>(null);
	let ticket = 0;

	$effect(() => {
		if (!live || data.classes.some((c) => !sizes[c.key])) return;
		const loops = relations.filter((r) => r.from === r.to);
		const loopRoom = Math.max(
			0,
			...loops.map((r) => 40 + (r.label ? textWidth(withMark(r.label, r.change), LABEL) : 0))
		);
		const nodes = data.classes.map((c) => ({ id: ids.get(c.key)!, ...sizes[c.key] }));
		const edges: GraphEdge[] = relations.map((r) => {
			const [source, target] = upward(r.kind) ? [r.to, r.from] : [r.from, r.to];
			return {
				id: r.id,
				source: ids.get(source)!,
				target: ids.get(target)!,
				label: r.label
					? { width: textWidth(withMark(r.label, r.change), LABEL) + 10, height: 16 }
					: undefined
			};
		});
		const run = ++ticket;
		layout(nodes, edges, {
			'elk.direction': 'DOWN',
			'elk.spacing.nodeNode': String(Math.max(36, loopRoom)),
			'elk.layered.spacing.nodeNodeBetweenLayers': '36',
			'elk.spacing.edgeNode': '16',
			'elk.spacing.edgeEdge': '12',
			'elk.padding': '[top=0,left=0,bottom=0,right=0]'
		}).then((graph) => {
			if (run !== ticket) return;
			drawn = draw(graph.boxes, graph.edges, loops);
		});
	});

	function decorate(kind: ClassRelationKind, segments: Point[][]): { d: string[]; heads: Head[] } {
		const segs = segments.map((seg) => [...seg]);
		const first = segs[0];
		const last = segs[segs.length - 1];
		const { start, startNext } = endpoints({ id: '', before: first, after: [] });
		const { end, endPrev } = endpoints({ id: '', before: last, after: [] });
		const out: Head[] = [];
		if (kind === 'composes' || kind === 'aggregates') {
			const h = diamond(start, direction(startNext, start), 16, 6);
			first[0] = h.stop;
			out.push({ d: h.d, fill: kind === 'composes' ? 'solid' : 'hollow' });
		}
		if (kind === 'inherits' || kind === 'implements') {
			const h = triangle(end, direction(endPrev, end), 12, 7);
			last[last.length - 1] = h.stop;
			out.push({ d: h.d, fill: 'hollow' });
		} else if (kind === 'uses') {
			out.push({ d: openArrow(end, direction(endPrev, end), 10, 5.5).d, fill: 'none' });
		}
		return { d: segs.map((seg) => polyline(seg, 4)), heads: out };
	}

	// The two ends of one edge label opposite sides, so a short edge cannot stack them.
	function card(text: string, tip: Point, dir: Point, clear: number, side: 1 | -1) {
		const at = along(tip, dir, -(clear + 8));
		if (Math.abs(dir.y) >= Math.abs(dir.x))
			return {
				text,
				x: at.x + 6 * side,
				y: at.y,
				anchor: side > 0 ? ('start' as const) : ('end' as const)
			};
		return { text, x: at.x, y: at.y - 8 * side, anchor: 'middle' as const };
	}

	function draw(
		laid: Record<string, Box>,
		routes: Record<string, RoutedEdge>,
		loops: typeof relations
	): Drawn {
		const placed: Record<string, Box> = {};
		for (const c of data.classes) placed[c.key] = laid[ids.get(c.key)!];
		const drawnRelations: Record<string, DrawnRelation> = {};

		for (const r of relations) {
			const raw = routes[r.id];
			if (!raw) continue;
			const route = upward(r.kind) ? reversed(raw) : raw;
			const points = [...route.before, ...route.after];
			const { start, startNext, end, endPrev } = endpoints(route);
			const { d, heads } = decorate(
				r.kind,
				route.after.length ? [route.before, route.after] : [route.before]
			);
			const cards = [];
			if (r.fromCard)
				cards.push(card(r.fromCard, start, direction(startNext, start), startClear(r.kind), 1));
			if (r.toCard) cards.push(card(r.toCard, end, direction(endPrev, end), endClear(r.kind), -1));
			drawnRelations[r.id] = { d, heads, label: route.label, mid: midpoint(points), cards };
		}

		const perClass: Record<string, number> = {};
		for (const r of loops) {
			const box = placed[r.from];
			if (!box) continue;
			const k = perClass[r.from] ?? 0;
			perClass[r.from] = k + 1;
			const right = box.x + box.width;
			const reach = right + 24 + k * 12;
			const y1 = box.y + Math.min(18, box.height / 4) + k * 8;
			const y2 = Math.min(box.y + box.height - 6, y1 + 26 + k * 8);
			const points = [
				{ x: right, y: y1 },
				{ x: reach, y: y1 },
				{ x: reach, y: y2 },
				{ x: right, y: y2 }
			];
			const h = decorate(r.kind, [points]);
			const width = r.label ? textWidth(withMark(r.label, r.change), LABEL) + 10 : 0;
			const label = r.label ? { x: reach + 4, y: (y1 + y2) / 2 - 8, width, height: 16 } : undefined;
			const cards = [];
			if (r.fromCard)
				cards.push({ text: r.fromCard, x: right + 4, y: y1 - 7, anchor: 'start' as const });
			if (r.toCard)
				cards.push({ text: r.toCard, x: right + 4, y: y2 + 8, anchor: 'start' as const });
			drawnRelations[r.id] = {
				d: h.d,
				heads: h.heads,
				label,
				mid: { x: reach, y: (y1 + y2) / 2 },
				cards
			};
		}

		const extents: Box[] = [...Object.values(placed)];
		for (const rel of Object.values(drawnRelations)) {
			if (rel.label) extents.push(rel.label);
			for (const c of rel.cards) {
				const w = textWidth(c.text, CARD);
				const x = c.anchor === 'start' ? c.x : c.anchor === 'middle' ? c.x - w / 2 : c.x - w;
				extents.push({ x, y: c.y - 6, width: w, height: 12 });
			}
		}
		const all = bounds(extents, [
			...Object.values(routes).flatMap((r) => [...r.before, ...r.after]),
			...Object.values(drawnRelations).map((r) => r.mid)
		]);
		return {
			width: all.width + PAD * 2,
			height: all.height + PAD * 2,
			dx: PAD - all.x,
			dy: PAD - all.y,
			boxes: placed,
			relations: drawnRelations
		};
	}

	const startClear = (kind: ClassRelationKind) =>
		kind === 'composes' || kind === 'aggregates' ? 16 : 0;
	const endClear = (kind: ClassRelationKind) =>
		kind === 'inherits' || kind === 'implements' ? 12 : kind === 'uses' ? 10 : 0;

	const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
	const italicName = (c: ClassDef) => c.stereotype?.toLowerCase() === 'abstract';
	const changes = $derived([
		...data.classes.flatMap((c) => [
			c.change,
			...(c.fields ?? []).map((f) => f.change),
			...(c.methods ?? []).map((m) => m.change)
		]),
		...(data.relations ?? []).map((r) => r.change)
	]);
</script>

{#snippet visibility(v: Visibility | undefined)}
	<span class="vis" title={v ? visibilityName[v] : undefined}>{v ?? ''}</span>
{/snippet}

<Frame
	title={widget.title ?? 'Classes'}
	{lod}
	{changes}
	meta={count(data.classes.length, 'class', 'classes')}
>
	<Stage width={drawn?.width ?? 0} height={drawn?.height ?? 0} {lod}>
		<div class="classes" class:pending={!drawn}>
			{#each data.classes as c (c.key)}
				{@const box = drawn?.boxes[c.key]}
				<div
					class="node"
					data-box={c.key}
					style:left="{box && drawn ? box.x + drawn.dx : 0}px"
					style:top="{box && drawn ? box.y + drawn.dy : 0}px"
					style:visibility={box ? undefined : 'hidden'}
					{@attach boxes.observe}
				>
					<Element key={c.key} change={c.change} {marks} {selected} onselect={select} class="cls">
						<div class="head" class:changed={!!c.change}>
							{#if c.stereotype}<div class="stereo">«{c.stereotype}»</div>{/if}
							<div class="name" class:italic={italicName(c)}>
								{#if c.change}<ChangeMark change={c.change} />{/if}
								{#if c.change === 'renamed' && c.from}<span class="from">{c.from}</span><span
										class="arrow">→</span
									>{/if}{c.name}
							</div>
						</div>
						{#if c.fields?.length}
							<div class="compartment" class:changed={!!c.change}>
								{#each c.fields as f, i (i)}
									<Element
										key="{c.key}.{f.name}"
										change={f.change}
										{marks}
										{selected}
										onselect={select}
										class="member {f.change ? 'is-changed' : ''}"
									>
										{@render visibility(f.visibility)}
										<span class="sig" class:static={f.static}>
											<span class="mname">{f.name}</span>{#if f.type}<span class="punct">:</span>
												<span class="type">{f.type}</span>{/if}
										</span>
										{#if f.change}<ChangeMark change={f.change} />{/if}
									</Element>
								{/each}
							</div>
						{/if}
						{#if c.methods?.length}
							<div class="compartment" class:changed={!!c.change}>
								{#each c.methods as m, i (i)}
									<Element
										key="{c.key}.{m.name}()"
										change={m.change}
										{marks}
										{selected}
										onselect={select}
										class="member {m.change ? 'is-changed' : ''}"
									>
										{@render visibility(m.visibility)}
										<span class="sig" class:static={m.static} class:italic={m.abstract}>
											<span class="mname">{m.name}</span><span class="punct">(</span><span
												class="type">{m.params ?? ''}</span
											><span class="punct">{m.returns ? '): ' : ')'}</span>{#if m.returns}<span
													class="type">{m.returns}</span
												>{/if}
										</span>
										{#if m.change}<ChangeMark change={m.change} />{/if}
									</Element>
								{/each}
							</div>
						{/if}
						{#if c.note && full}<div class="note">{c.note}</div>{/if}
					</Element>
				</div>
			{/each}

			{#if drawn}
				<svg class="edges" width={drawn.width} height={drawn.height} aria-hidden={!full}>
					<g transform="translate({drawn.dx} {drawn.dy})">
						{#each relations as r (r.id)}
							{@const rel = drawn.relations[r.id]}
							{#if rel}
								<SvgElement
									key={r.element}
									change={r.change}
									{marks}
									{selected}
									onselect={select}
									box={rel.label}
									badge={rel.label ? undefined : rel.mid}
									class="relation"
								>
									<g
										class="rel"
										class:is-selected={selected === r.element}
										class:dashed={dashed(r.kind)}
										style:--tint={changeColor(r.change) ?? 'var(--edge-base)'}
									>
										{#each rel.d as d, i (i)}
											<path class="hit" {d} />
											<path class="line" {d} />
										{/each}
										{#each rel.heads as h, i (i)}
											<path class="head {h.fill}" d={h.d} />
										{/each}
										{#each rel.cards as c, i (i)}
											<text class="card" x={c.x} y={c.y} dy="0.35em" text-anchor={c.anchor}
												>{c.text}</text
											>
										{/each}
										{#if rel.label && r.label}
											<text
												class="rlabel pw-strike"
												x={rel.label.x + rel.label.width / 2}
												y={rel.label.y + rel.label.height / 2}
												dy="0.35em"
												>{#if r.change}<tspan class="csym" style:fill={changeColor(r.change)}
														>{changeSymbol(r.change) + ' '}</tspan
													>{/if}{r.label}</text
											>
										{/if}
									</g>
								</SvgElement>
							{/if}
						{/each}
					</g>
				</svg>
			{/if}
		</div>
	</Stage>
</Frame>

<style>
	.classes {
		position: relative;
		width: 100%;
		height: 100%;
		min-height: 2rem;
		--edge-base: color-mix(in srgb, var(--ink) 60%, transparent);
		--box-line: color-mix(in srgb, var(--ink) 40%, var(--line));
	}
	.pending {
		visibility: hidden;
		overflow: hidden;
	}
	.node {
		position: absolute;
		width: max-content;
	}
	.classes :global(.cls) {
		box-sizing: border-box;
		min-width: 8rem;
		max-width: 16rem;
		border: 1px solid var(--box-line);
		border-radius: 0.5rem;
		background: var(--surface);
		font-size: 0.72rem;
	}
	.classes :global(.cls.pw-added),
	.classes :global(.cls.pw-removed),
	.classes :global(.cls.pw-changed) {
		border-color: var(--pw-change);
		box-shadow: 0 0 0 1px color-mix(in srgb, var(--pw-change) 35%, transparent);
	}
	.classes :global(.cls.pw-selected) {
		background: color-mix(in srgb, var(--accent) 6%, var(--surface));
	}
	.head {
		padding: 0.35rem 0.6rem 0.4rem;
		text-align: center;
		border-radius: calc(0.5rem - 1px) calc(0.5rem - 1px) 0 0;
	}
	.head.changed {
		background: color-mix(in srgb, var(--pw-change) 12%, transparent);
	}
	.stereo {
		font-size: 0.65rem;
		color: var(--muted);
		line-height: 1.2;
	}
	.name {
		font-size: 0.82rem;
		font-weight: 700;
		line-height: 1.25;
		overflow-wrap: anywhere;
	}
	.name :global(.chg) {
		margin-right: 0.3rem;
	}
	.compartment :global(.member .chg) {
		align-self: center;
		margin-left: 0.3rem;
	}
	.from {
		font-weight: 500;
		color: var(--muted);
		text-decoration: line-through;
		text-decoration-color: color-mix(in srgb, var(--muted) 60%, transparent);
	}
	.arrow {
		margin: 0 0.25rem;
		font-weight: 500;
		color: var(--changed);
	}
	.italic {
		font-style: italic;
	}
	.compartment {
		padding: 0.25rem 0;
		border-top: 1px solid var(--box-line);
	}
	.compartment.changed {
		border-top-color: color-mix(in srgb, var(--pw-change) 50%, var(--line));
	}
	.compartment :global(.member) {
		display: grid;
		grid-template-columns: 0.85rem 1fr auto;
		align-items: baseline;
		column-gap: 0.1rem;
		padding: 0.05rem 0.6rem 0.05rem 0.5rem;
		font-family: var(--font-mono);
		font-size: 0.68rem;
		line-height: 1.45;
	}
	.compartment :global(.member.is-changed) {
		background: color-mix(in srgb, var(--pw-change) 8%, transparent);
		box-shadow: inset 2px 0 0 var(--pw-change);
	}
	.compartment :global(.member.pw-selected) {
		background: color-mix(in srgb, var(--accent) 12%, transparent);
	}
	.compartment :global(.member .pw-mark) {
		top: 50%;
		right: -0.55rem;
		transform: translateY(-50%);
	}
	.vis {
		color: var(--muted);
	}
	.sig {
		overflow-wrap: anywhere;
	}
	.static {
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	.mname {
		color: var(--ink);
	}
	.punct {
		color: var(--muted);
	}
	.type {
		color: color-mix(in srgb, var(--ink) 62%, var(--muted));
	}
	.note {
		padding: 0.3rem 0.6rem 0.35rem;
		border-top: 1px dashed var(--box-line);
		font-size: 0.66rem;
		line-height: 1.35;
		color: var(--muted);
	}
	.edges {
		position: absolute;
		top: 0;
		left: 0;
		overflow: visible;
		pointer-events: none;
	}
	.edges :global(.relation) {
		pointer-events: auto;
	}
	.rel {
		--edge: var(--tint);
	}
	.rel .line {
		fill: none;
		stroke: var(--edge);
		stroke-width: 1.25;
	}
	.rel.dashed .line {
		stroke-dasharray: 6 4;
	}
	.rel .hit {
		fill: none;
		stroke: transparent;
		stroke-width: 10;
	}
	.rel .head {
		stroke: var(--edge);
		stroke-width: 1.25;
		stroke-linejoin: round;
	}
	.rel .head.none {
		fill: none;
	}
	.rel .head.hollow {
		fill: var(--surface);
	}
	.rel .head.solid {
		fill: var(--edge);
	}
	:global(.pw-svg-element:focus-visible) .rel {
		--edge: var(--accent);
	}
	:global(.pw-svg-element:focus-visible) .rel .line,
	:global(.pw-svg-element:hover) .rel .line {
		stroke-width: 2;
	}
	.rel.is-selected {
		--edge: var(--accent);
	}
	.rel.is-selected .line {
		stroke-width: 2;
	}
	.csym {
		font-style: normal;
		font-weight: 700;
	}
	.card {
		font-family: var(--font-mono);
		font-size: 10px;
		fill: var(--muted);
	}
	.rlabel {
		font-family: var(--font-sans);
		font-size: 11px;
		font-style: italic;
		text-anchor: middle;
		fill: var(--edge);
	}
</style>
