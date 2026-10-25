<script lang="ts">
	let { size = 24, heat = 3 }: { size?: number; heat?: number } = $props();

	const uid = $props.id();
	const glow = $derived(Math.min(1, 0.25 + heat / 12));
</script>

<svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" class="orb">
	<defs>
		<radialGradient id="{uid}-core" cx="50%" cy="58%" r="55%">
			<stop offset="0%" stop-color="var(--accent)" stop-opacity={glow} />
			<stop offset="45%" stop-color="var(--accent)" stop-opacity={glow * 0.35} />
			<stop offset="100%" stop-color="var(--accent)" stop-opacity="0" />
		</radialGradient>
		<radialGradient id="{uid}-glass" cx="35%" cy="28%" r="70%">
			<stop offset="0%" stop-color="var(--ink)" stop-opacity="0.22" />
			<stop offset="60%" stop-color="var(--ink)" stop-opacity="0.02" />
		</radialGradient>
	</defs>
	<circle cx="16" cy="16" r="14" fill="var(--bg)" stroke="var(--line)" stroke-width="1.2" />
	<circle cx="16" cy="16" r="13" fill="url(#{uid}-core)" />
	<path
		d="M7.5 17.5c2.6-3.4 5.4-5 8.5-5s5.9 1.6 8.5 5c-2.6 3.4-5.4 5-8.5 5s-5.9-1.6-8.5-5Z"
		fill="none"
		stroke="var(--accent)"
		stroke-opacity={0.35 + glow * 0.5}
		stroke-width="1.1"
	/>
	<circle cx="16" cy="17.5" r="2.4" fill="var(--accent)" fill-opacity={0.5 + glow * 0.5} />
	<circle cx="16" cy="16" r="13" fill="url(#{uid}-glass)" />
</svg>

<style>
	.orb {
		display: block;
	}
</style>
