<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		width,
		height,
		lod,
		children
	}: { width: number; height: number; lod: 'preview' | 'full'; children: Snippet } = $props();

	// The preview box minus the frame header, until the view has been measured.
	const PREVIEW = { width: 298, height: 151 };
	// Full views shrink a diagram this far to avoid a scrollbar, then scroll.
	const MIN_FIT = 0.8;
	const INSET = 8;

	let measuredWidth = $state(0);
	let measuredHeight = $state(0);

	const preview = $derived(lod === 'preview');
	const viewWidth = $derived(measuredWidth || (preview ? PREVIEW.width : 0));
	const viewHeight = $derived(measuredHeight || (preview ? PREVIEW.height : 0));
	const scale = $derived.by(() => {
		if (width <= 0 || height <= 0) return 1;
		if (preview) return Math.min(1, (viewWidth - INSET) / width, (viewHeight - INSET) / height);
		const fit = (viewWidth - INSET * 2) / width;
		return fit < 1 && fit >= MIN_FIT ? fit : 1;
	});
	const offsetX = $derived(preview ? (viewWidth - width * scale) / 2 : 0);
	const offsetY = $derived(preview ? (viewHeight - height * scale) / 2 : 0);

	let drag: { x: number; y: number; left: number; top: number } | null = null;

	function down(event: PointerEvent) {
		const view = event.currentTarget as HTMLElement;
		if (preview || event.button !== 0) return;
		if ((event.target as Element).closest('[data-element]')) return;
		if (view.scrollWidth <= view.clientWidth && view.scrollHeight <= view.clientHeight) return;
		drag = { x: event.clientX, y: event.clientY, left: view.scrollLeft, top: view.scrollTop };
		view.setPointerCapture(event.pointerId);
	}

	function move(event: PointerEvent) {
		if (!drag) return;
		const view = event.currentTarget as HTMLElement;
		view.scrollLeft = drag.left - (event.clientX - drag.x);
		view.scrollTop = drag.top - (event.clientY - drag.y);
	}

	function up() {
		drag = null;
	}
</script>

<div
	class="view"
	class:preview
	bind:clientWidth={measuredWidth}
	bind:clientHeight={measuredHeight}
	role="presentation"
	onpointerdown={down}
	onpointermove={move}
	onpointerup={up}
	onpointercancel={up}
>
	<div
		class="sizer"
		style:width="{width * scale}px"
		style:height="{height * scale}px"
		style:left={preview ? `${offsetX}px` : undefined}
		style:top={preview ? `${offsetY}px` : undefined}
	>
		<div
			class="canvas"
			style:width="{width}px"
			style:height="{height}px"
			style:transform={scale === 1 ? undefined : `scale(${scale})`}
		>
			{@render children()}
		</div>
	</div>
</div>

<style>
	.view {
		position: relative;
		overflow: auto;
		max-height: 36rem;
		padding: 0.5rem;
		/* A scrollbar must not change the width the fit scale is computed from. */
		scrollbar-gutter: stable;
		background: var(--surface);
		border-radius: 0 0 0.5rem 0.5rem;
	}
	.preview {
		height: 100%;
		max-height: none;
		padding: 0;
		overflow: hidden;
		scrollbar-gutter: auto;
	}
	.sizer {
		position: relative;
		margin: 0 auto;
	}
	.preview .sizer {
		position: absolute;
		margin: 0;
	}
	.canvas {
		position: absolute;
		top: 0;
		left: 0;
		transform-origin: 0 0;
	}
</style>
