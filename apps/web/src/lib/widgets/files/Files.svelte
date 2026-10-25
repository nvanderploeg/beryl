<script lang="ts">
	// Stub: replaced by the widget builder.
	import type { FilesData } from '../types.ts';
	import type { TypeProps } from '../props.ts';

	let { data, lod }: TypeProps<FilesData> = $props();
</script>

<div class="text-xs opacity-60">files widget ({lod}, {Object.keys(data ?? {}).length} fields)</div>
