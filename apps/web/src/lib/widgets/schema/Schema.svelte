<script lang="ts">
	// Stub: replaced by the widget builder.
	import type { SchemaData } from '../types.ts';
	import type { TypeProps } from '../props.ts';

	let { data, lod }: TypeProps<SchemaData> = $props();
</script>

<div class="text-xs opacity-60">schema widget ({lod}, {Object.keys(data ?? {}).length} fields)</div>
