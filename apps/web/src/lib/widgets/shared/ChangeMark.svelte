<script lang="ts">
	import type { Change } from '../types.ts';
	import { changeColor, changeSymbol } from '../change.ts';

	let { change }: { change: Change } = $props();
</script>

<span class="chg" style:--c={changeColor(change)} title={change}>{changeSymbol(change)}</span>

<style>
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
		font-style: normal;
		line-height: 1;
		text-decoration: none;
		vertical-align: 0.05em;
	}
</style>
