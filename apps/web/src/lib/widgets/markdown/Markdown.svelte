<script lang="ts">
	// Stub: replaced by the widget builder.
	import type { MarkdownData } from '../types.ts';
	import type { TypeProps } from '../props.ts';

	let { data, lod }: TypeProps<MarkdownData> = $props();
</script>

<div class="text-xs opacity-60">
	markdown widget ({lod}, {Object.keys(data ?? {}).length} fields)
</div>
