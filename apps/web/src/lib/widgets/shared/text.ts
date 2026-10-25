import type { Change } from '../types.ts';
import { changeSymbol } from '../change.ts';

let context: CanvasRenderingContext2D | null | undefined;
const families: Record<'sans' | 'mono', string> = { sans: 'sans-serif', mono: 'monospace' };

function canvas(): CanvasRenderingContext2D | null {
	if (context !== undefined) return context;
	if (typeof document === 'undefined') return null;
	context = document.createElement('canvas').getContext('2d');
	const style = getComputedStyle(document.documentElement);
	families.sans = style.getPropertyValue('--font-sans').trim() || families.sans;
	families.mono = style.getPropertyValue('--font-mono').trim() || families.mono;
	return context;
}

export interface Font {
	size: number;
	weight?: number;
	mono?: boolean;
}

// Pass live=false during SSR and hydration so both render the same estimate.
export function textWidth(text: string, font: Font, live = true): number {
	const ctx = live ? canvas() : null;
	if (!ctx) return text.length * font.size * (font.mono ? 0.6 : 0.56);
	ctx.font = `${font.weight ?? 400} ${font.size}px ${font.mono ? families.mono : families.sans}`;
	return ctx.measureText(text).width;
}

export function wrapText(
	text: string,
	maxWidth: number,
	font: Font,
	live = true,
	maxLines = 3
): string[] {
	const words = text.split(/\s+/).filter(Boolean);
	const lines: string[] = [];
	let line = '';
	for (const word of words) {
		const next = line ? `${line} ${word}` : word;
		if (textWidth(next, font, live) <= maxWidth || !line) line = next;
		else {
			lines.push(line);
			line = word;
		}
	}
	if (line) lines.push(line);
	const out = lines.map((l) => clip(l, maxWidth, font, live));
	if (out.length <= maxLines) return out.length ? out : [''];
	const kept = out.slice(0, maxLines);
	kept[maxLines - 1] = clip(`${kept[maxLines - 1]}…`, maxWidth, font, live);
	return kept;
}

function clip(line: string, maxWidth: number, font: Font, live: boolean): string {
	if (textWidth(line, font, live) <= maxWidth) return line;
	let s = line;
	while (s.length > 1 && textWidth(`${s}…`, font, live) > maxWidth) s = s.slice(0, -1);
	return `${s.replace(/…$/, '')}…`;
}

// The first character of the result is the mark: every change symbol is one character.
export function withMark(text: string, change: Change | undefined): string {
	return change ? `${changeSymbol(change)} ${text}` : text;
}
