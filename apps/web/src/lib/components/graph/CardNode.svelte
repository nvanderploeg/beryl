<script lang="ts">
	import { Handle, Position, type NodeProps, type Node as FlowNode } from '@xyflow/svelte';
	import WidgetView from '#lib/widgets/WidgetView.svelte';
	import { useBoard } from '#lib/ui/board.svelte.ts';
	import { KIND_LABEL, STATUS_LABEL, firstLine, toneOf } from '#lib/ui/kinds.ts';
	import { pendingAnswer } from '#lib/ui/topic.ts';
	import Mark from '../Mark.svelte';
	import { useGraph, type BoxData } from './context.ts';

	let { data }: NodeProps<FlowNode<BoxData>> = $props();

	const board = useBoard();
	const graph = useGraph();

	const node = $derived(board.byPath.get(data.box.path));
	const lod = $derived(graph.lod);
	const pending = $derived(node ? pendingAnswer(board.notes, node.path) : undefined);
	const notes = $derived(
		node
			? board.notes.filter((n) => n.anchor.path === node.path && n.status !== 'resolved').length
			: 0
	);
	const current = $derived(!!node && board.topic.current === node.path);
	const widget = $derived(node?.widgets[0]);
	const says = $derived(node && node.kind === 'decision' ? node.answer || node.recommendation : '');
</script>

{#if node}
	<div
		class="card tone-{toneOf(node)} k-{node.kind} lod-{lod}"
		class:selected={board.selected === node.path}
		class:current
		class:fresh={board.fresh.has(node.path)}
		style:width="{data.box.width}px"
		style:height="{data.box.height}px"
		data-path={node.path}
		data-testid="graph-card"
	>
		<Handle type="target" position={Position.Top} isConnectable={false} class="pw-handle" />
		<div class="head">
			<Mark kind={node.kind} status={node.status} size={lod === 'near' ? 16 : 18} {current} />
			{#if lod === 'near'}
				<span class="kind">{KIND_LABEL[node.kind]}</span>
				<span class="status s-{node.status}">{STATUS_LABEL[node.status]}</span>
			{/if}
			{#if node.rank !== null && node.status === 'open' && node.kind === 'decision'}
				<span class="rank tabular">#{node.rank}</span>
			{/if}
			{#if current}<span class="now">Now asking</span>{/if}
			<span class="badges">
				{#if pending}
					<span class="badge waiting" title="Answered on the board, waiting on the agent"
						>{lod === 'near' ? 'waiting on agent' : '✓'}</span
					>
				{/if}
				{#if notes}
					<span class="badge notes tabular" title="{notes} open note{notes === 1 ? '' : 's'}"
						>{notes}</span
					>
				{/if}
			</span>
		</div>
		<h3 class="title">{node.title}</h3>
		{#if lod !== 'far' && node.gist}
			<p class="gist">{node.gist}</p>
		{/if}
		{#if lod === 'near'}
			{#if says}
				<p class="says" class:answer={!!node.answer}>
					<span>{node.answer ? 'Answer' : 'Recommendation'}</span>{firstLine(says)}
				</p>
			{/if}
			{#if widget}
				<div class="preview" class:muted-preview={node.status !== 'open'}>
					<WidgetView {widget} lod="preview" />
				</div>
			{/if}
		{:else if node.widgets.length}
			<div class="chips">
				{#each node.widgets as w (w.key)}
					<span class="wchip">{w.title ?? w.type}</span>
				{/each}
			</div>
		{/if}
		<Handle type="source" position={Position.Bottom} isConnectable={false} class="pw-handle" />
	</div>
{/if}

<style>
	.card {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 12px 10px 10px;
		overflow: hidden;
		border-radius: 12px;
		border: 1px solid var(--line);
		background: var(--surface);
		color: var(--ink);
		box-shadow: 0 1px 2px rgb(0 0 0 / 0.12);
		transition:
			border-color 160ms,
			box-shadow 160ms;
	}
	.card :global(.pw-handle) {
		opacity: 0;
		pointer-events: none;
		width: 1px;
		height: 1px;
		min-width: 0;
		min-height: 0;
		border: 0;
	}
	.tone-unknown {
		border: 1.5px solid var(--accent);
		box-shadow:
			0 0 0 3px var(--glow-soft),
			0 6px 24px -10px var(--glow);
	}
	.tone-assume {
		border: 1.5px dashed var(--accent);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 8%, transparent);
	}
	.tone-fog {
		border: 1.5px solid color-mix(in srgb, var(--fog) 70%, transparent);
		background: var(--hatch-fog), color-mix(in srgb, var(--fog) 9%, var(--surface));
		box-shadow: 0 0 22px -4px color-mix(in srgb, var(--fog) 40%, transparent);
	}
	.tone-risk {
		border: 1.5px solid var(--risk);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--risk) 14%, transparent);
	}
	.tone-risk::before {
		content: '';
		position: absolute;
		top: 0;
		right: 0;
		border-style: solid;
		border-width: 0 22px 22px 0;
		border-color: transparent var(--risk) transparent transparent;
	}
	.tone-settled,
	.tone-quiet {
		background: color-mix(in srgb, var(--surface) 55%, var(--bg));
		border-color: color-mix(in srgb, var(--line) 75%, transparent);
		color: color-mix(in srgb, var(--ink) 58%, var(--muted));
		box-shadow: none;
	}
	.tone-settled .title,
	.tone-quiet .title {
		font-weight: 600;
	}
	.tone-parked {
		background: color-mix(in srgb, var(--surface-2) 70%, var(--bg));
		color: var(--muted);
		box-shadow: none;
	}
	.tone-dropped {
		background: transparent;
		border-style: dotted;
		color: var(--muted);
		opacity: 0.6;
		box-shadow: none;
	}
	.tone-dropped .title {
		text-decoration: line-through;
	}
	.current {
		animation: pw-breathe 3.2s var(--ease) infinite;
	}
	.selected {
		outline: 2px solid color-mix(in srgb, var(--ink) 75%, transparent);
		outline-offset: 3px;
	}
	.fresh::after {
		content: '';
		position: absolute;
		top: 8px;
		right: 8px;
		width: calc(8px / min(var(--z), 1));
		height: calc(8px / min(var(--z), 1));
		border-radius: 50%;
		background: var(--ink);
		box-shadow: 0 0 10px 2px var(--fresh);
	}
	.tone-risk.fresh::after {
		right: 26px;
	}
	.head {
		flex: none;
		display: flex;
		align-items: center;
		gap: 6px;
		min-height: 20px;
		font-size: 11px;
	}
	.kind {
		font-weight: 600;
		color: var(--muted);
	}
	.status {
		padding: 0 6px;
		border-radius: 999px;
		border: 1px solid var(--line);
		color: var(--muted);
		font-size: 10.5px;
		line-height: 16px;
	}
	.status.s-open {
		color: var(--accent);
		border-color: color-mix(in srgb, var(--accent) 45%, transparent);
	}
	.tone-fog .status.s-open {
		color: var(--fog);
		border-color: color-mix(in srgb, var(--fog) 45%, transparent);
	}
	.status.s-settled {
		color: var(--settled);
	}
	.rank {
		font-weight: 700;
		color: var(--accent);
	}
	.now {
		padding: 0 6px;
		border-radius: 999px;
		background: var(--accent);
		color: var(--bg);
		font-weight: 700;
		line-height: 16px;
		white-space: nowrap;
	}
	.badges {
		margin-left: auto;
		display: flex;
		gap: 4px;
	}
	.badge {
		min-width: 18px;
		padding: 0 6px;
		border-radius: 999px;
		font-weight: 700;
		line-height: 18px;
		text-align: center;
		white-space: nowrap;
	}
	.badge.notes {
		background: var(--accent);
		color: var(--bg);
	}
	.badge.waiting {
		border: 1px solid color-mix(in srgb, var(--settled) 60%, transparent);
		color: var(--settled);
		line-height: 16px;
	}
	.title {
		flex: none;
		margin: 0;
		font-size: 15px;
		font-weight: 650;
		line-height: 1.25;
		letter-spacing: -0.01em;
		overflow: hidden;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
	}
	.gist {
		flex: 0 1 auto;
		min-height: 0;
		margin: 0;
		font-size: 12.5px;
		line-height: 1.42;
		color: color-mix(in srgb, currentColor 82%, var(--muted));
		overflow: hidden;
		display: -webkit-box;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		-webkit-box-orient: vertical;
	}
	.says {
		flex: none;
		margin: 2px 0 0;
		padding: 5px 8px;
		border-left: 2px solid var(--accent);
		border-radius: 0 6px 6px 0;
		background: color-mix(in srgb, var(--accent) 7%, transparent);
		font-size: 12px;
		line-height: 1.4;
		overflow: hidden;
		display: -webkit-box;
		-webkit-line-clamp: 4;
		line-clamp: 4;
		-webkit-box-orient: vertical;
	}
	.says span {
		display: block;
		font-size: 10px;
		font-weight: 700;
		color: var(--accent);
	}
	.says.answer {
		border-left-color: var(--settled);
		background: color-mix(in srgb, var(--settled) 8%, transparent);
	}
	.says.answer span {
		color: var(--settled);
	}
	.preview {
		flex: none;
		margin-top: auto;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.preview :global(.pw-widget) {
		border-radius: 8px;
		background: var(--bg);
		box-shadow: inset 0 0 0 1px var(--line);
	}

	.muted-preview {
		opacity: 0.8;
	}
	.chips {
		flex: none;
		margin-top: auto;
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.wchip {
		padding: 2px 8px;
		border-radius: 6px;
		border: 1px solid var(--line);
		background: color-mix(in srgb, var(--surface-2) 60%, transparent);
		color: var(--muted);
		font-size: clamp(11px, calc(10px / var(--z)), 20px);
		white-space: nowrap;
	}

	.lod-mid .title {
		font-size: clamp(15px, calc(13px / var(--z)), 26px);
		-webkit-line-clamp: 3;
		line-clamp: 3;
	}
	.lod-mid .gist {
		font-size: clamp(12.5px, calc(11px / var(--z)), 21px);
		-webkit-line-clamp: 3;
		line-clamp: 3;
	}
	.lod-mid .head {
		font-size: clamp(11px, calc(10px / var(--z)), 18px);
	}
	.lod-mid .head :global(svg.mark) {
		width: clamp(16px, calc(14px / var(--z)), 26px);
		height: clamp(16px, calc(14px / var(--z)), 26px);
	}
	.lod-far .head :global(svg.mark) {
		width: clamp(22px, calc(14px / var(--z)), 48px);
		height: clamp(22px, calc(14px / var(--z)), 48px);
	}
	.lod-mid .badge {
		line-height: 1.5;
	}
	.lod-far .title {
		font-size: clamp(22px, calc(14px / var(--z)), 64px);
		-webkit-line-clamp: 3;
		line-clamp: 3;
	}
	.lod-far .head {
		font-size: clamp(14px, calc(11px / var(--z)), 40px);
	}
</style>
