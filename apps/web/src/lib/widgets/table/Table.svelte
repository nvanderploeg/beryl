<script lang="ts">
	// Stub: replaced by the widget builder.
	import type { TableData } from '../types.ts';
	import type { TypeProps } from '../props.ts';

	let { data, lod }: TypeProps<TableData> = $props();
</script>

<div class="text-xs opacity-60">table widget ({lod}, {Object.keys(data ?? {}).length} fields)</div>
