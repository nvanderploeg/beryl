<script lang="ts">
	// Stub: replaced by the widget builder.
	import type { CodeData } from '../types.ts';
	import type { TypeProps } from '../props.ts';

	let { data, lod }: TypeProps<CodeData> = $props();
</script>

<div class="text-xs opacity-60">code widget ({lod}, {Object.keys(data ?? {}).length} fields)</div>
