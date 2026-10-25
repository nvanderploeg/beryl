export interface Size {
	width: number;
	height: number;
}

// Each observed element names its box in data-box; sizes are keyed by that name.
export function measured() {
	const sizes = $state<Record<string, Size>>({});
	const observer =
		typeof ResizeObserver === 'undefined'
			? null
			: new ResizeObserver((entries) => {
					for (const entry of entries) {
						const el = entry.target as HTMLElement;
						const key = el.dataset.box;
						if (key === undefined) continue;
						const old = sizes[key];
						if (old?.width !== el.offsetWidth || old?.height !== el.offsetHeight)
							sizes[key] = { width: el.offsetWidth, height: el.offsetHeight };
					}
				});
	return {
		sizes,
		observe(el: HTMLElement) {
			observer?.observe(el);
			return () => observer?.unobserve(el);
		},
		disconnect() {
			observer?.disconnect();
		}
	};
}
