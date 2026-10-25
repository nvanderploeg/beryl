<script lang="ts">
	import { SvelteFlowProvider } from '@xyflow/svelte';
	import '@xyflow/svelte/dist/style.css';
	import GraphCanvas from './GraphCanvas.svelte';
</script>

<SvelteFlowProvider>
	<GraphCanvas />
</SvelteFlowProvider>
