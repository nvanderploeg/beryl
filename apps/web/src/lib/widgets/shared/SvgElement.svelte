<!-- The SVG twin of ../Element.svelte: keep the two in step. -->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Change } from '../types.ts';
	import type { Box } from './geometry.ts';

	let {
		key,
		change,
		marks,
		selected,
		onselect,
		box,
		badge,
		class: klass = '',
		children
	}: {
		key: string;
		change?: Change | 'kept';
		marks?: Record<string, number>;
		selected?: string | null;
		onselect?: (element: string) => void;
		box?: Box;
		badge?: { x: number; y: number };
		class?: string;
		children: Snippet;
	} = $props();

	const count = $derived(marks?.[key] ?? 0);
	const isSelected = $derived(selected === key);
	const at = $derived(badge ?? (box ? { x: box.x + box.width, y: box.y } : undefined));
	const pill = $derived(Math.max(17.6, 8 + String(count).length * 6.4));

	function activate(event: Event) {
		if (!onselect) return;
		event.stopPropagation();
		onselect(key);
	}

	function keydown(event: KeyboardEvent) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			activate(event);
		}
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<g
	data-element={key}
	class="pw-svg-element {klass}"
	class:pw-selectable={!!onselect}
	class:pw-selected={isSelected}
	class:pw-added={change === 'added'}
	class:pw-removed={change === 'removed'}
	class:pw-changed={change === 'changed' || change === 'renamed'}
	role={onselect ? 'button' : undefined}
	tabindex={onselect ? 0 : undefined}
	onclick={onselect ? activate : undefined}
	onkeydown={onselect ? keydown : undefined}
>
	{#if box}
		<rect
			class="pw-svg-frame"
			x={box.x - 3}
			y={box.y - 3}
			width={box.width + 6}
			height={box.height + 6}
			rx="4"
		/>
	{/if}
	{@render children()}
	{#if count > 0 && at}
		<g class="pw-svg-mark" transform="translate({at.x} {at.y})">
			<title>{count} note{count === 1 ? '' : 's'}</title>
			<rect x={-pill / 2} y="-8.8" width={pill} height="17.6" rx="8.8" />
			<text dy="0.35em">{count}</text>
		</g>
	{/if}
</g>

<style>
	.pw-svg-element {
		outline: none;
	}
	.pw-selectable {
		cursor: pointer;
	}
	.pw-svg-frame {
		fill: transparent;
		stroke: none;
	}
	.pw-selectable:hover > .pw-svg-frame {
		stroke: color-mix(in srgb, var(--accent) 60%, transparent);
		stroke-width: 1;
		stroke-dasharray: 3 2;
	}
	.pw-selectable:focus-visible > .pw-svg-frame,
	.pw-selected > .pw-svg-frame,
	.pw-selected:hover > .pw-svg-frame {
		stroke: var(--accent);
		stroke-width: 2;
		stroke-dasharray: none;
	}
	.pw-selected > .pw-svg-frame {
		fill: color-mix(in srgb, var(--accent) 10%, transparent);
	}
	.pw-added {
		--pw-change: var(--added);
	}
	.pw-removed {
		--pw-change: var(--removed);
	}
	.pw-removed :global(text.pw-strike) {
		text-decoration: line-through;
		text-decoration-color: color-mix(in srgb, var(--removed) 70%, transparent);
	}
	.pw-changed {
		--pw-change: var(--changed);
	}
	.pw-svg-mark {
		pointer-events: none;
	}
	.pw-svg-mark rect {
		fill: var(--accent);
	}
	.pw-svg-mark text {
		fill: #fff;
		font-family: var(--font-sans);
		font-size: 0.65rem;
		font-weight: 700;
		text-anchor: middle;
		text-decoration: none;
	}
</style>
