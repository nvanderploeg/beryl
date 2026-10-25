<script lang="ts">
	// Stub: replaced by the widget builder.
	import type { MigrationData } from '../types.ts';
	import type { TypeProps } from '../props.ts';

	let { data, lod }: TypeProps<MigrationData> = $props();
</script>

<div class="text-xs opacity-60">
	migration widget ({lod}, {Object.keys(data ?? {}).length} fields)
</div>
