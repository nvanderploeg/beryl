import type { Widget } from '#lib/types.ts';

export interface TypeProps<T> {
	data: T;
	widget: Widget;
	lod: 'preview' | 'full';
	marks?: Record<string, number>;
	selected?: string | null;
	onselect?: (element: string) => void;
}
