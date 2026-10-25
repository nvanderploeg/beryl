<script lang="ts">
	import { Handle, Position, type NodeProps, type Node as FlowNode } from '@xyflow/svelte';
	import type { BoxData } from './context.ts';

	let { data }: NodeProps<FlowNode<BoxData>> = $props();
</script>

<div
	class="stub"
	style:width="{data.box.width}px"
	style:height="{data.box.height}px"
	title="An edge points at {data.box.path}, which does not exist"
	data-testid="graph-stub"
>
	<Handle type="target" position={Position.Top} isConnectable={false} class="pw-handle" />
	<span class="label">missing</span>
	<span class="path">{data.box.path}</span>
	<Handle type="source" position={Position.Bottom} isConnectable={false} class="pw-handle" />
</div>

<style>
	.stub {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 0 10px;
		box-sizing: border-box;
		border-radius: 999px;
		border: 1.5px dashed color-mix(in srgb, var(--removed) 70%, transparent);
		background: color-mix(in srgb, var(--removed) 6%, var(--bg));
		color: var(--muted);
		font-size: 11px;
		overflow: hidden;
	}
	.stub :global(.pw-handle) {
		opacity: 0;
		pointer-events: none;
		width: 1px;
		height: 1px;
		min-width: 0;
		min-height: 0;
		border: 0;
	}
	.label {
		flex: none;
		font-weight: 700;
		color: var(--removed);
	}
	.path {
		min-width: 0;
		font-family: var(--font-mono);
		font-size: 10.5px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
