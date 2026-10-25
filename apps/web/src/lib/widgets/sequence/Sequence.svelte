<script lang="ts">
	// Stub: replaced by the widget builder.
	import type { SequenceData } from '../types.ts';
	import type { TypeProps } from '../props.ts';

	let { data, lod }: TypeProps<SequenceData> = $props();
</script>

<div class="text-xs opacity-60">
	sequence widget ({lod}, {Object.keys(data ?? {}).length} fields)
</div>
