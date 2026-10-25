// Stub: the server builder replaces this with the full checks of docs/widgets.md.
import { WIDGET_TYPES, type Widget, type WidgetType } from '#lib/types.ts';

export function validateWidget(
	widget: unknown
): { ok: true; widget: Widget } | { ok: false; reason: string } {
	if (typeof widget !== 'object' || widget === null) return { ok: false, reason: 'not an object' };
	const w = widget as Widget;
	if (!WIDGET_TYPES.includes(w.type as WidgetType))
		return { ok: false, reason: `unknown type ${w.type}` };
	return { ok: true, widget: w };
}
