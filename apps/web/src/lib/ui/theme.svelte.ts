import { keys, readStored, writeStored } from './storage.ts';

export type ThemeMode = 'system' | 'light' | 'dark';

class Theme {
	mode: ThemeMode = $state('system');
	prefersDark = $state(true);
	resolved: 'light' | 'dark' = $derived(
		this.mode === 'system' ? (this.prefersDark ? 'dark' : 'light') : this.mode
	);
	private started = false;

	start(): void {
		if (this.started) return;
		this.started = true;
		const stored = readStored(keys.theme);
		this.mode = stored === 'light' || stored === 'dark' ? stored : 'system';
		const media = window.matchMedia('(prefers-color-scheme: dark)');
		this.prefersDark = media.matches;
		media.addEventListener('change', () => (this.prefersDark = media.matches));
	}

	set(mode: ThemeMode): void {
		this.mode = mode;
		writeStored(keys.theme, mode === 'system' ? null : mode);
		if (mode === 'system') delete document.documentElement.dataset.theme;
		else document.documentElement.dataset.theme = mode;
	}

	cycle(): void {
		const order: ThemeMode[] = ['system', 'light', 'dark'];
		this.set(order[(order.indexOf(this.mode) + 1) % order.length]);
	}
}

export const theme = new Theme();
