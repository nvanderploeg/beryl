<script lang="ts">
	import { BaseEdge, useInternalNode, type EdgeProps, type InternalNode } from '@xyflow/svelte';
	import type { EdgeRel } from '#lib/types.ts';
	import { useGraph } from './context.ts';

	let { id, source, target, data }: EdgeProps = $props();

	const graph = useGraph();
	// These capture the ends once: keep edge ids naming both ends so a new end remounts.
	// svelte-ignore state_referenced_locally
	const from = useInternalNode(source);
	// svelte-ignore state_referenced_locally
	const to = useInternalNode(target);

	const rel = $derived((data?.rel as EdgeRel) ?? 'relates');
	const lifted = $derived(!!data?.lifted);

	function rect(n: InternalNode) {
		const w = n.measured.width ?? n.width ?? 0;
		const h = n.measured.height ?? n.height ?? 0;
		const { x, y } = n.internals.positionAbsolute;
		return { x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
	}

	const path = $derived.by(() => {
		const a = from.current;
		const b = to.current;
		if (!a || !b) return null;
		const s = rect(a);
		const t = rect(b);
		const dx = t.cx - s.cx;
		const dy = t.cy - s.cy;
		const vertical = Math.abs(dy) * (s.w + t.w) >= Math.abs(dx) * (s.h + t.h);
		let sx: number, sy: number, tx: number, ty: number;
		if (vertical) {
			sx = s.cx;
			tx = t.cx;
			sy = dy >= 0 ? s.y + s.h : s.y;
			ty = dy >= 0 ? t.y : t.y + t.h;
		} else {
			sy = s.cy;
			ty = t.cy;
			sx = dx >= 0 ? s.x + s.w : s.x;
			tx = dx >= 0 ? t.x : t.x + t.w;
		}
		const bend = Math.max(24, (vertical ? Math.abs(ty - sy) : Math.abs(tx - sx)) * 0.45);
		const c1 = vertical
			? `${sx},${sy + Math.sign(dy || 1) * bend}`
			: `${sx + Math.sign(dx || 1) * bend},${sy}`;
		const c2 = vertical
			? `${tx},${ty - Math.sign(dy || 1) * bend}`
			: `${tx - Math.sign(dx || 1) * bend},${ty}`;
		return `M${sx},${sy} C${c1} ${c2} ${tx},${ty}`;
	});

	const marker = $derived(
		rel === 'relies_on'
			? 'url(#pw-arrow)'
			: rel === 'supersedes'
				? 'url(#pw-arrow-hollow)'
				: undefined
	);
	const scale = $derived(Math.max(1, 1 / Math.max(graph.zoom, 0.05)) ** 0.75);
</script>

{#if path}
	<BaseEdge
		{id}
		{path}
		markerEnd={marker}
		class="pw-rel pw-{rel}{lifted ? ' pw-lifted' : ''}"
		style="--w: {scale}"
		interactionWidth={0}
	/>
{/if}

<style>
	:global(.svelte-flow__edge-path.pw-rel) {
		stroke: color-mix(in srgb, var(--ink) 42%, transparent);
		stroke-width: calc(1.6px * var(--w, 1));
		fill: none;
	}
	:global(.svelte-flow__edge-path.pw-relates) {
		stroke: color-mix(in srgb, var(--ink) 34%, transparent);
		stroke-width: calc(1.2px * var(--w, 1));
		stroke-dasharray: calc(1.5px * var(--w, 1)) calc(5px * var(--w, 1));
		stroke-linecap: round;
	}
	:global(.svelte-flow__edge-path.pw-conflicts) {
		stroke: var(--removed);
		stroke-width: calc(2px * var(--w, 1));
	}
	:global(.svelte-flow__edge-path.pw-supersedes) {
		stroke-dasharray: calc(7px * var(--w, 1)) calc(5px * var(--w, 1));
	}
	:global(.svelte-flow__edge-path.pw-lifted) {
		stroke-opacity: 0.55;
	}
</style>
