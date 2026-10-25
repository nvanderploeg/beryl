<script lang="ts">
	import type { NodeKind, NodeStatus } from '#lib/types.ts';
	import { KIND_LABEL, STATUS_LABEL } from '#lib/ui/kinds.ts';

	let {
		kind,
		status,
		size = 16,
		current = false
	}: { kind: NodeKind; status: NodeStatus; size?: number; current?: boolean } = $props();

	const color = $derived(
		status === 'settled'
			? 'var(--settled)'
			: status === 'parked'
				? 'var(--parked)'
				: status === 'dropped'
					? 'var(--dropped)'
					: kind === 'fog'
						? 'var(--fog)'
						: kind === 'risk'
							? 'var(--risk)'
							: kind === 'decision' || kind === 'assumption'
								? 'var(--accent)'
								: 'var(--muted)'
	);
	const open = $derived(status === 'open');
	const label = $derived(`${KIND_LABEL[kind]}, ${STATUS_LABEL[status].toLowerCase()}`);
</script>

<svg
	class="mark"
	class:current
	width={size}
	height={size}
	viewBox="0 0 16 16"
	role="img"
	aria-label={label}
	style:--c={color}
>
	<title>{label}</title>
	{#if kind === 'decision'}
		<circle
			cx="8"
			cy="8"
			r="6.4"
			fill={open ? 'none' : 'var(--c)'}
			fill-opacity={open ? 0 : 0.18}
			stroke="var(--c)"
			stroke-width="1.6"
		/>
	{:else if kind === 'assumption'}
		<circle
			cx="8"
			cy="8"
			r="6.4"
			fill="none"
			stroke="var(--c)"
			stroke-width="1.6"
			stroke-dasharray="2.6 2"
		/>
	{:else if kind === 'fog'}
		<circle cx="8" cy="8" r="6.6" fill="var(--c)" fill-opacity="0.16" />
		<path
			d="M3.2 6.4h9.6M2.4 8.8h11.2M3.6 11.2h8.8"
			stroke="var(--c)"
			stroke-width="1.2"
			stroke-linecap="round"
			opacity={open ? 0.95 : 0.5}
		/>
	{:else if kind === 'risk'}
		<path
			d="M8 1.8 14.6 13.6H1.4Z"
			fill="var(--c)"
			fill-opacity={open ? 0.16 : 0.1}
			stroke="var(--c)"
			stroke-width="1.5"
			stroke-linejoin="round"
		/>
	{:else if kind === 'fact'}
		<rect x="3.4" y="3.4" width="9.2" height="9.2" rx="1.6" fill="var(--c)" fill-opacity="0.75" />
	{:else if kind === 'term'}
		<rect
			x="2.6"
			y="2.6"
			width="10.8"
			height="10.8"
			rx="2"
			fill="none"
			stroke="var(--c)"
			stroke-width="1.4"
		/>
		<path d="M5.4 6h5.2M8 6v5" stroke="var(--c)" stroke-width="1.4" stroke-linecap="round" />
	{:else if kind === 'constraint'}
		<path
			d="M5.4 2.6H3v10.8h2.4M10.6 2.6H13v10.8h-2.4"
			fill="none"
			stroke="var(--c)"
			stroke-width="1.5"
			stroke-linecap="round"
			stroke-linejoin="round"
		/>
	{:else}
		<path
			d="M8 2 14 8 8 14 2 8Z"
			fill="none"
			stroke="var(--c)"
			stroke-width="1.4"
			stroke-linejoin="round"
		/>
	{/if}

	{#if kind === 'decision' || kind === 'assumption' || kind === 'risk' || kind === 'area'}
		{#if status === 'settled'}
			<path
				d="M5.2 8.3 7.2 10.2 10.9 6"
				fill="none"
				stroke="var(--c)"
				stroke-width="1.7"
				stroke-linecap="round"
				stroke-linejoin="round"
				transform={kind === 'risk' ? 'translate(0 1.4) scale(1 0.9)' : undefined}
			/>
		{:else if status === 'parked'}
			<path
				d="M6.5 5.6v4.8M9.5 5.6v4.8"
				stroke="var(--c)"
				stroke-width="1.6"
				stroke-linecap="round"
			/>
		{:else if status === 'dropped'}
			<path
				d="M5.8 5.8 10.2 10.2M10.2 5.8 5.8 10.2"
				stroke="var(--c)"
				stroke-width="1.5"
				stroke-linecap="round"
			/>
		{:else if kind === 'decision'}
			<text x="8" y="11.3" text-anchor="middle" class="glyph">?</text>
		{:else if kind === 'risk'}
			<text x="8" y="12.6" text-anchor="middle" class="glyph risk">!</text>
		{:else if kind === 'assumption'}
			<text x="8" y="11.1" text-anchor="middle" class="glyph">~</text>
		{/if}
	{/if}
</svg>

<style>
	.mark {
		flex: none;
		display: inline-block;
		vertical-align: -0.18em;
		overflow: visible;
		border-radius: 999px;
	}
	.glyph {
		font-family: var(--font-sans);
		font-size: 9.5px;
		font-weight: 700;
		fill: var(--c);
	}
	.glyph.risk {
		font-size: 9px;
	}
	.current {
		animation: pw-breathe 3.2s var(--ease) infinite;
	}
</style>
