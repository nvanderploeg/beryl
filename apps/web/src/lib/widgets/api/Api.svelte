<script lang="ts">
	// Stub: replaced by the widget builder.
	import type { ApiData } from '../types.ts';
	import type { TypeProps } from '../props.ts';

	let { data, lod }: TypeProps<ApiData> = $props();
</script>

<div class="text-xs opacity-60">api widget ({lod}, {Object.keys(data ?? {}).length} fields)</div>
