<script lang="ts">
	let {
		axis,
		label,
		onstart,
		onmove,
		onreset
	}: {
		/** `x` drags left and right, resizing columns; `y` drags up and down, resizing rows. */
		axis: 'x' | 'y';
		label: string;
		onstart: () => void;
		/** Pixels moved along the axis since `onstart`. */
		onmove: (delta: number) => void;
		onreset?: () => void;
	} = $props();

	const STEP = 24;

	let origin = 0;
	let active = $state(false);

	function pointerdown(event: PointerEvent) {
		if (event.button !== 0) return;
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		origin = axis === 'x' ? event.clientX : event.clientY;
		active = true;
		onstart();
		event.preventDefault();
	}

	function pointermove(event: PointerEvent) {
		if (!active) return;
		onmove((axis === 'x' ? event.clientX : event.clientY) - origin);
	}

	function pointerup() {
		active = false;
	}

	function keydown(event: KeyboardEvent) {
		const keys = axis === 'x' ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown'];
		const at = keys.indexOf(event.key);
		if (at === -1) return;
		event.preventDefault();
		onstart();
		onmove(at === 0 ? -STEP : STEP);
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
	class="splitter {axis}"
	class:active
	role="separator"
	tabindex="0"
	aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'}
	aria-label={label}
	data-testid="splitter-{label.toLowerCase().replaceAll(' ', '-')}"
	onpointerdown={pointerdown}
	onpointermove={pointermove}
	onpointerup={pointerup}
	onpointercancel={pointerup}
	onkeydown={keydown}
	ondblclick={onreset}
></div>

<style>
	.splitter {
		position: relative;
		flex: none;
		z-index: 5;
		touch-action: none;
		background: var(--line);
	}
	.splitter.x {
		width: 1px;
		cursor: col-resize;
	}
	.splitter.y {
		height: 1px;
		cursor: row-resize;
	}
	/* Wider hit area than the visible hairline. */
	.splitter::before {
		content: '';
		position: absolute;
	}
	.x::before {
		inset: 0 -4px;
	}
	.y::before {
		inset: -4px 0;
	}
	.splitter:hover,
	.splitter:focus-visible,
	.splitter.active {
		background: var(--accent);
		outline: none;
	}
	.x:hover,
	.x:focus-visible,
	.x.active {
		box-shadow: 0 0 0 1px var(--accent);
	}
	.y:hover,
	.y:focus-visible,
	.y.active {
		box-shadow: 0 0 0 1px var(--accent);
	}
</style>
