<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import type { StatesData } from '../types.ts';
	import type { TypeProps } from '../props.ts';
	import Element from '../Element.svelte';
	import { changeColor, changeSymbol } from '../change.ts';
	import Frame from '../shared/Frame.svelte';
	import ChangeMark from '../shared/ChangeMark.svelte';
	import Stage from '../shared/Stage.svelte';
	import SvgElement from '../shared/SvgElement.svelte';
	import { textWidth, withMark } from '../shared/text.ts';
	import {
		bounds,
		direction,
		midpoint,
		polyline,
		triangle,
		type Box,
		type Point
	} from '../shared/geometry.ts';
	import { endpoints, layout, type GraphEdge, type RoutedEdge } from '../shared/graph.ts';
	import { transitionKey } from './elements.ts';
	import { measured } from '../shared/measure.svelte.ts';

	let { data, widget, lod, marks, selected, onselect }: TypeProps<StatesData> = $props();

	const full = $derived(lod === 'full');
	const select = $derived(full ? onselect : undefined);
	const LABEL = { size: 11 };
	const PAD = 10;

	const stateIds = $derived(new Map(data.states.map((s) => [s.key, `s:${s.key}`])));
	const transitions = $derived(
		data.transitions
			.filter((t) => stateIds.has(t.from) && stateIds.has(t.to))
			.map((t, i) => ({ ...t, id: `t${i}`, element: transitionKey(t) }))
	);

	let live = $state(false);
	const boxes = measured();
	const sizes = boxes.sizes;

	onMount(() => (live = true));
	onDestroy(() => boxes.disconnect());

	interface Drawn {
		width: number;
		height: number;
		dx: number;
		dy: number;
		boxes: Record<string, Box>;
		dots: { at: Point; d: string; head: string }[];
		edges: Record<string, { d: string[]; head: string; label?: Box; mid: Point }>;
	}

	let drawn = $state<Drawn | null>(null);
	let ticket = 0;

	$effect(() => {
		if (!live || data.states.some((s) => !sizes[s.key])) return;
		const loops = transitions.filter((t) => t.from === t.to);
		const nodes = data.states.map((s) => ({ id: stateIds.get(s.key)!, ...sizes[s.key] }));
		const edges: GraphEdge[] = transitions.map((t) => ({
			id: t.id,
			source: stateIds.get(t.from)!,
			target: stateIds.get(t.to)!,
			label: t.label
				? { width: textWidth(withMark(t.label, t.change), LABEL) + 10, height: 16 }
				: undefined
		}));
		for (const s of data.states) {
			if (s.kind !== 'initial') continue;
			nodes.push({ id: `d:${s.key}`, width: 12, height: 12 });
			edges.push({ id: `d:${s.key}`, source: `d:${s.key}`, target: stateIds.get(s.key)! });
		}
		const run = ++ticket;
		layout(nodes, edges, {
			'elk.direction': 'RIGHT',
			'elk.layered.cycleBreaking.strategy': 'DEPTH_FIRST',
			'elk.spacing.nodeNode': loops.length ? '40' : '24',
			'elk.layered.spacing.nodeNodeBetweenLayers': '28',
			'elk.spacing.edgeNode': '12',
			'elk.spacing.edgeEdge': '10',
			'elk.padding': '[top=0,left=0,bottom=0,right=0]'
		}).then((graph) => {
			if (run !== ticket) return;
			drawn = draw(graph.boxes, graph.edges, loops);
		});
	});

	function draw(
		laid: Record<string, Box>,
		routes: Record<string, RoutedEdge>,
		loops: typeof transitions
	): Drawn {
		const boxes: Record<string, Box> = {};
		for (const s of data.states) boxes[s.key] = laid[stateIds.get(s.key)!];

		const edges: Drawn['edges'] = {};
		for (const t of transitions) {
			const route = routes[t.id];
			if (!route) continue;
			const { end, endPrev } = endpoints(route);
			const head = triangle(end, direction(endPrev, end), 9, 4.5);
			const after = route.after.length ? route.after : route.before;
			const trimmed = [...after.slice(0, -1), head.stop];
			const d = route.after.length
				? [polyline(route.before, 4), polyline(trimmed, 4)]
				: [polyline(trimmed, 4)];
			const points = [...route.before, ...route.after];
			edges[t.id] = { d, head: head.d, label: route.label, mid: midpoint(points) };
		}

		const perState: Record<string, number> = {};
		for (const t of loops) {
			const box = boxes[t.from];
			if (!box) continue;
			const k = perState[t.from] ?? 0;
			perState[t.from] = k + 1;
			const up = k % 2 === 0;
			const rise = 18 + Math.floor(k / 2) * 16;
			const half = Math.min(box.width / 4, 16) + Math.floor(k / 2) * 6;
			const cx = box.x + box.width / 2;
			const edgeY = up ? box.y : box.y + box.height;
			const outY = up ? edgeY - rise : edgeY + rise;
			const tip = { x: cx - half, y: edgeY };
			const head = triangle(tip, { x: 0, y: up ? 1 : -1 }, 9, 4.5);
			const d = polyline(
				[
					{ x: cx + half, y: edgeY },
					{ x: cx + half, y: outY },
					{ x: cx - half, y: outY },
					head.stop
				],
				6
			);
			const width = t.label ? textWidth(withMark(t.label, t.change), LABEL) + 10 : 0;
			const label = t.label
				? { x: cx - width / 2, y: up ? outY - 18 : outY + 2, width, height: 16 }
				: undefined;
			edges[t.id] = { d: [d], head: head.d, label, mid: { x: cx, y: outY } };
		}

		const dots: Drawn['dots'] = [];
		for (const s of data.states) {
			const route = routes[`d:${s.key}`];
			const dot = laid[`d:${s.key}`];
			if (!route || !dot) continue;
			const { end, endPrev } = endpoints(route);
			const head = triangle(end, direction(endPrev, end), 8, 4);
			const at = { x: dot.x + dot.width / 2, y: dot.y + dot.height / 2 };
			const points = [...route.before.slice(0, -1), head.stop];
			dots.push({ at, d: polyline(points, 4), head: head.d });
		}

		const all = bounds(
			[
				...Object.values(boxes),
				...Object.values(edges).flatMap((e) => (e.label ? [e.label] : [])),
				...dots.map((d) => ({ x: d.at.x - 6, y: d.at.y - 6, width: 12, height: 12 }))
			],
			[
				...Object.values(routes).flatMap((r) => [...r.before, ...r.after]),
				...Object.values(edges).map((e) => e.mid)
			]
		);
		return {
			width: all.width + PAD * 2,
			height: all.height + PAD * 2,
			dx: PAD - all.x,
			dy: PAD - all.y,
			boxes,
			dots,
			edges
		};
	}
</script>

<Frame
	title={widget.title ?? 'States'}
	{lod}
	meta="{data.states.length} state{data.states.length === 1 ? '' : 's'}"
	changes={[...data.states.map((s) => s.change), ...data.transitions.map((t) => t.change)]}
>
	<Stage width={drawn?.width ?? 0} height={drawn?.height ?? 0} {lod}>
		<div class="states" class:pending={!drawn}>
			{#each data.states as s (s.key)}
				{@const box = drawn?.boxes[s.key]}
				<div
					class="node"
					data-box={s.key}
					style:left="{box && drawn ? box.x + drawn.dx : 0}px"
					style:top="{box && drawn ? box.y + drawn.dy : 0}px"
					style:visibility={box ? undefined : 'hidden'}
					{@attach boxes.observe}
				>
					<Element
						key={s.key}
						change={s.change}
						{marks}
						{selected}
						onselect={select}
						class="state kind-{s.kind ?? 'normal'}"
					>
						<span class="label">
							{#if s.change}<ChangeMark change={s.change} />{/if}{s.label}
						</span>
						{#if s.note && full}<span class="note">{s.note}</span>{/if}
					</Element>
				</div>
			{/each}

			{#if drawn}
				<svg class="edges" width={drawn.width} height={drawn.height} aria-hidden={!full}>
					<g transform="translate({drawn.dx} {drawn.dy})">
						{#each drawn.dots as dot, i (i)}
							<g class="entry">
								<path class="line" d={dot.d} />
								<path class="head" d={dot.head} />
								<circle cx={dot.at.x} cy={dot.at.y} r="6" />
							</g>
						{/each}
						{#each transitions as t (t.id)}
							{@const e = drawn.edges[t.id]}
							{#if e}
								<SvgElement
									key={t.element}
									change={t.change}
									{marks}
									{selected}
									onselect={select}
									box={e.label}
									badge={e.label ? undefined : e.mid}
									class="transition"
								>
									<g
										class="tr"
										class:is-selected={selected === t.element}
										style:--tint={changeColor(t.change) ?? 'var(--edge-base)'}
									>
										{#each e.d as d, i (i)}
											<path class="hit" {d} />
											<path class="line" {d} />
										{/each}
										<path class="head" d={e.head} />
									</g>
									{#if e.label && t.label}
										<text
											class="tlabel pw-strike"
											x={e.label.x + e.label.width / 2}
											y={e.label.y + e.label.height / 2}
											dy="0.35em"
											style:fill={changeColor(t.change) ?? 'var(--ink)'}
											>{#if t.change}<tspan class="csym">{changeSymbol(t.change) + ' '}</tspan
												>{/if}{t.label}</text
										>
									{/if}
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
	.states {
		position: relative;
		width: 100%;
		height: 100%;
		min-height: 2rem;
		--edge-base: color-mix(in srgb, var(--ink) 55%, transparent);
	}
	.pending {
		visibility: hidden;
		overflow: hidden;
	}
	.node {
		position: absolute;
		width: max-content;
	}
	.states :global(.state) {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.15rem;
		box-sizing: border-box;
		min-width: 5.5rem;
		max-width: 13rem;
		padding: 0.4rem 0.75rem;
		border: 1px solid color-mix(in srgb, var(--ink) 45%, var(--line));
		border-radius: 0.6rem;
		background: var(--surface);
		text-align: center;
	}
	.states :global(.state.kind-final) {
		box-shadow:
			inset 0 0 0 2px var(--surface),
			inset 0 0 0 3px color-mix(in srgb, var(--ink) 45%, var(--line));
		padding: 0.5rem 0.85rem;
	}
	.states :global(.state.pw-added),
	.states :global(.state.pw-removed),
	.states :global(.state.pw-changed) {
		border-color: var(--pw-change);
		background: color-mix(in srgb, var(--pw-change) 10%, var(--surface));
	}
	.states :global(.state.kind-final.pw-added),
	.states :global(.state.kind-final.pw-removed),
	.states :global(.state.kind-final.pw-changed) {
		box-shadow:
			inset 0 0 0 2px var(--surface),
			inset 0 0 0 3px var(--pw-change);
	}
	.states :global(.state.pw-selected) {
		background: color-mix(in srgb, var(--accent) 10%, var(--surface));
	}
	.label {
		font-size: 0.8rem;
		font-weight: 600;
		line-height: 1.25;
	}
	.label :global(.chg) {
		margin-right: 0.3rem;
	}
	.note {
		font-size: 0.68rem;
		line-height: 1.3;
		color: var(--muted);
	}
	.edges {
		position: absolute;
		top: 0;
		left: 0;
		overflow: visible;
		pointer-events: none;
	}
	.entry .line {
		fill: none;
		stroke: var(--ink);
		stroke-width: 1.25;
	}
	.entry .head,
	.entry circle {
		fill: var(--ink);
	}
	.edges :global(.transition) {
		pointer-events: auto;
	}
	.tr {
		--edge: var(--tint);
	}
	.tr.is-selected {
		--edge: var(--accent);
	}
	.tr .line {
		fill: none;
		stroke: var(--edge);
		stroke-width: 1.25;
	}
	.tr .head {
		fill: var(--edge);
	}
	.tr .hit {
		fill: none;
		stroke: transparent;
		stroke-width: 10;
	}
	:global(.pw-svg-element:focus-visible) .tr {
		--edge: var(--accent);
	}
	:global(.pw-svg-element:focus-visible) .tr .line,
	:global(.pw-svg-element:hover) .tr .line {
		stroke-width: 2;
	}
	.tr.is-selected .line {
		stroke: var(--accent);
		stroke-width: 2;
	}
	.tr.is-selected .head {
		fill: var(--accent);
	}
	.csym {
		font-weight: 700;
	}
	.tlabel {
		font-family: var(--font-sans);
		font-size: 11px;
		text-anchor: middle;
	}
</style>
