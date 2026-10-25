<script lang="ts">
	import { onMount } from 'svelte';
	import type { Change, SequenceData } from '../types.ts';
	import type { TypeProps } from '../props.ts';
	import { changeColor } from '../change.ts';
	import Frame from '../shared/Frame.svelte';
	import Stage from '../shared/Stage.svelte';
	import SvgElement from '../shared/SvgElement.svelte';
	import { polyline } from '../shared/geometry.ts';
	import { LINE, layoutSequence } from './layout.ts';

	let { data, widget, lod, marks, selected, onselect }: TypeProps<SequenceData> = $props();

	const full = $derived(lod === 'full');
	const select = $derived(full ? onselect : undefined);

	let live = $state(false);
	let fonts = $state(0);
	onMount(() => {
		live = true;
		const remeasure = () => (fonts += 1);
		document.fonts?.ready.then(remeasure);
		document.fonts?.addEventListener('loadingdone', remeasure);
		return () => document.fonts?.removeEventListener('loadingdone', remeasure);
	});

	const laid = $derived.by(() => {
		void fonts;
		return layoutSequence(data, live);
	});
</script>

{#snippet icon(kind: SequenceData['actors'][number]['kind'], x: number, y: number)}
	<g class="icon" transform="translate({x} {y})">
		{#if kind === 'person'}
			<circle cx="0" cy="-3.6" r="3" />
			<path d="M-5.5 6.5 C-5.5 1.2 5.5 1.2 5.5 6.5" />
		{:else if kind === 'service'}
			<path d="M0 -7 L6.06 -3.5 L6.06 3.5 L0 7 L-6.06 3.5 L-6.06 -3.5 Z" />
			<circle cx="0" cy="0" r="2.2" />
		{:else if kind === 'store'}
			<ellipse cx="0" cy="-4.5" rx="5.8" ry="2.2" />
			<path d="M-5.8 -4.5 V4.5 A5.8 2.2 0 0 0 5.8 4.5 V-4.5" />
			<path d="M-5.8 0 A5.8 2.2 0 0 0 5.8 0" />
		{:else if kind === 'external'}
			<circle cx="0" cy="0" r="6.5" />
			<ellipse cx="0" cy="0" rx="2.8" ry="6.5" />
			<path d="M-6.5 0 H6.5" />
		{/if}
	</g>
{/snippet}

{#snippet label(
	lines: string[],
	x: number,
	y: number,
	anchor: 'start' | 'middle',
	change: Change | undefined
)}
	<text class="slabel pw-strike" text-anchor={anchor}>
		{#each lines as line, i (i)}
			<tspan {x} y={y + i * LINE}
				>{#if change && i === 0}<tspan class="csym" style:fill={changeColor(change)}
						>{line.slice(0, 1)}</tspan
					>{line.slice(1)}{:else}{line}{/if}</tspan
			>
		{/each}
	</text>
{/snippet}

<Frame
	title={widget.title ?? 'Sequence'}
	{lod}
	meta="{data.steps.length} step{data.steps.length === 1 ? '' : 's'}"
	changes={data.steps.map((s) => s.change)}
>
	<Stage width={laid.width} height={laid.height} {lod}>
		<svg
			class="sequence"
			width={laid.width}
			height={laid.height}
			viewBox="0 0 {laid.width} {laid.height}"
			aria-hidden={!full}
		>
			<g transform="translate({laid.dx} 0)">
				{#each laid.actors as a (a.key)}
					<line
						class="lifeline"
						x1={a.x}
						x2={a.x}
						y1={laid.lifeline.top}
						y2={laid.lifeline.bottom}
					/>
				{/each}

				{#each laid.actors as a (a.key)}
					<SvgElement key={a.key} {marks} {selected} onselect={select} box={a.box} class="actor">
						<rect
							class="head"
							class:is-selected={selected === a.key}
							x={a.box.x}
							y={a.box.y}
							width={a.box.width}
							height={a.box.height}
							rx="6"
						/>
						{#if a.kind}{@render icon(a.kind, a.iconX, a.box.y + a.box.height / 2)}{/if}
						<text class="alabel" x={a.textX} y={a.box.y + a.box.height / 2} dy="0.35em"
							>{a.label}</text
						>
					</SvgElement>
				{/each}

				{#each laid.steps as s, i (i)}
					<SvgElement
						key={s.key}
						change={s.change}
						{marks}
						{selected}
						onselect={select}
						box={s.box}
						badge={s.badge}
						class="step"
					>
						<g
							class="msg {s.type === 'note' ? 'note' : s.style}"
							class:is-selected={selected === s.key}
							style:--tint={changeColor(s.change) ?? 'var(--edge-base)'}
						>
							{#if s.type === 'note'}
								{@const b = s.box}
								<path
									class="paper"
									d="M{b.x} {b.y} H{b.x + b.width - 8} L{b.x + b.width} {b.y + 8} V{b.y +
										b.height} H{b.x} Z"
								/>
								<path class="fold" d="M{b.x + b.width - 8} {b.y} V{b.y + 8} H{b.x + b.width}" />
								{@render label(s.lines, s.text.x, s.text.y, 'middle', s.change)}
							{:else if s.type === 'self'}
								<path class="hit" d={polyline(s.points)} />
								<path class="line" d={polyline(s.points, 3)} />
								<path class="arrow" class:filled={s.head.filled} d={s.head.d} />
								{@render label(s.lines, s.text.x, s.text.y, 'start', s.change)}
							{:else}
								<line
									class="hit"
									x1={s.line[0].x}
									y1={s.line[0].y}
									x2={s.line[1].x}
									y2={s.line[1].y}
								/>
								<line
									class="line"
									x1={s.line[0].x}
									y1={s.line[0].y}
									x2={s.line[1].x}
									y2={s.line[1].y}
								/>
								<path class="arrow" class:filled={s.head.filled} d={s.head.d} />
								{@render label(s.lines, s.text.x, s.text.y, 'middle', s.change)}
							{/if}
						</g>
					</SvgElement>
				{/each}
			</g>
		</svg>
	</Stage>
</Frame>

<style>
	.sequence {
		display: block;
		overflow: visible;
		font-family: var(--font-sans);
		--edge-base: color-mix(in srgb, var(--ink) 70%, transparent);
		--box-line: color-mix(in srgb, var(--ink) 40%, var(--line));
	}
	.lifeline {
		stroke: color-mix(in srgb, var(--ink) 30%, var(--line));
		stroke-width: 1;
		stroke-dasharray: 4 4;
	}
	.head {
		fill: var(--surface);
		stroke: var(--box-line);
		stroke-width: 1;
	}
	.head.is-selected {
		fill: color-mix(in srgb, var(--accent) 10%, var(--surface));
	}
	.icon {
		fill: none;
		stroke: var(--muted);
		stroke-width: 1.3;
		stroke-linejoin: round;
	}
	.alabel {
		font-size: 12px;
		font-weight: 600;
		fill: var(--ink);
	}
	.msg {
		--c: var(--tint);
	}
	.msg .line {
		fill: none;
		stroke: var(--c);
		stroke-width: 1.25;
	}
	.msg.reply .line {
		stroke-dasharray: 5 4;
	}
	.msg .hit {
		fill: none;
		stroke: transparent;
		stroke-width: 10;
	}
	.msg .arrow {
		fill: none;
		stroke: var(--c);
		stroke-width: 1.25;
		stroke-linejoin: round;
	}
	.msg .arrow.filled {
		fill: var(--c);
	}
	.slabel {
		font-size: 11px;
		fill: var(--ink);
	}
	.msg:not(.note) .slabel {
		fill: color-mix(in srgb, var(--c) 35%, var(--ink));
	}
	.paper {
		fill: var(--surface-2);
		stroke: color-mix(in srgb, var(--c) 70%, var(--line));
		stroke-width: 1;
	}
	.fold {
		fill: none;
		stroke: color-mix(in srgb, var(--c) 70%, var(--line));
		stroke-width: 1;
	}
	.csym {
		font-weight: 700;
	}
	.note .slabel {
		fill: var(--ink);
	}
	:global(.pw-svg-element:focus-visible) .msg {
		--c: var(--accent);
	}
	:global(.pw-svg-element:focus-visible) .msg .line,
	:global(.pw-svg-element:hover) .msg .line {
		stroke-width: 2;
	}
	.msg.is-selected {
		--c: var(--accent);
	}
	.msg.is-selected .line {
		stroke-width: 2;
	}
</style>
