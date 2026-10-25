<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Change } from './types.ts';

	let {
		key,
		change,
		marks,
		selected,
		onselect,
		tag = 'div',
		class: klass = '',
		children
	}: {
		key: string;
		change?: Change | 'kept';
		marks?: Record<string, number>;
		selected?: string | null;
		onselect?: (element: string) => void;
		tag?: string;
		class?: string;
		children: Snippet;
	} = $props();

	const count = $derived(marks?.[key] ?? 0);
	const isSelected = $derived(selected === key);

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

<svelte:element
	this={tag}
	data-element={key}
	class="pw-element {klass}"
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
	{@render children()}
	{#if count > 0}
		<span class="pw-mark" title="{count} note{count === 1 ? '' : 's'}">{count}</span>
	{/if}
</svelte:element>

<style>
	.pw-element {
		position: relative;
	}
	.pw-selectable {
		cursor: pointer;
	}
	.pw-selectable:hover {
		outline: 1px dashed color-mix(in srgb, var(--accent) 60%, transparent);
		outline-offset: 1px;
	}
	.pw-selectable:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
	}
	.pw-selected,
	.pw-selected:hover {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
		background: color-mix(in srgb, var(--accent) 10%, transparent);
	}
	.pw-added {
		--pw-change: var(--added);
	}
	.pw-removed {
		--pw-change: var(--removed);
		text-decoration: line-through;
		text-decoration-color: color-mix(in srgb, var(--removed) 70%, transparent);
	}
	.pw-changed {
		--pw-change: var(--changed);
	}
	.pw-mark {
		position: absolute;
		top: -0.45rem;
		right: -0.45rem;
		min-width: 1.1rem;
		height: 1.1rem;
		padding: 0 0.25rem;
		border-radius: 999px;
		background: var(--accent);
		color: #fff;
		font-size: 0.65rem;
		font-weight: 700;
		line-height: 1.1rem;
		text-align: center;
		text-decoration: none;
		pointer-events: none;
		z-index: 2;
	}
</style>
