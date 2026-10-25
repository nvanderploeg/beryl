<script lang="ts">
	// Stub: replaced by the widget builder.
	import type { StatesData } from '../types.ts';
	import type { TypeProps } from '../props.ts';

	let { data, lod }: TypeProps<StatesData> = $props();
</script>

<div class="text-xs opacity-60">states widget ({lod}, {Object.keys(data ?? {}).length} fields)</div>
