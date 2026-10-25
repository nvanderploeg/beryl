import type { Change, SequenceData } from '../types.ts';
import { bounds, openArrow, triangle, type Box, type Point } from '../shared/geometry.ts';
import { textWidth, withMark, wrapText, type Font } from '../shared/text.ts';

export const ACTOR_FONT: Font = { size: 12, weight: 600 };
export const LABEL_FONT: Font = { size: 11 };
export const LINE = 14;

const PAD = 12;
const HEAD = 34;
const ICON = 22;
const MIN_GAP = 96;
const LABEL_MAX = 200;
const LOOP = 28;

type ActorKind = SequenceData['actors'][number]['kind'];

export interface ActorLayout {
	key: string;
	kind: ActorKind;
	label: string;
	x: number;
	box: Box;
	textX: number;
	iconX: number;
}

interface StepBase {
	key: string;
	change?: Change;
	lines: string[];
	box: Box;
	badge: Point;
}

export type StepLayout =
	| (StepBase & {
			type: 'message';
			style: 'call' | 'reply' | 'async';
			line: [Point, Point];
			head: { d: string; filled: boolean };
			text: Point; // first baseline, centred
	  })
	| (StepBase & {
			type: 'self';
			style: 'call' | 'reply' | 'async';
			points: Point[];
			head: { d: string; filled: boolean };
			text: Point; // first baseline, left-aligned
	  })
	| (StepBase & { type: 'note'; text: Point });

export interface SequenceLayout {
	width: number;
	height: number;
	dx: number;
	actors: ActorLayout[];
	lifeline: { top: number; bottom: number };
	steps: StepLayout[];
}

const widest = (lines: string[], font: Font, live: boolean) =>
	Math.max(0, ...lines.map((l) => textWidth(l, font, live)));

// live: measure with the browser's fonts; false gives the same estimate on server and client.
export function layoutSequence(data: SequenceData, live: boolean): SequenceLayout {
	const index = new Map(data.actors.map((a, i) => [a.key, i]));
	const heads = data.actors.map((a) => {
		const icon = a.kind ? ICON : 0;
		const [label] = wrapText(a.label, 180 - icon - 20, ACTOR_FONT, live, 1);
		const text = textWidth(label, ACTOR_FONT, live);
		return { label, text, icon, width: Math.max(72, text + icon + 22) };
	});
	const gaps = heads
		.slice(1)
		.map((h, i) => Math.max(MIN_GAP, heads[i].width / 2 + h.width / 2 + 20));

	const widen = (lo: number, hi: number, need: number) => {
		const span = gaps.slice(lo, hi).reduce((a, b) => a + b, 0);
		if (span >= need) return;
		const extra = (need - span) / (hi - lo);
		for (let i = lo; i < hi; i++) gaps[i] += extra;
	};

	const steps = data.steps
		.filter((s) => index.has(s.from) && index.has(s.to))
		.map((s) => {
			const a = index.get(s.from)!;
			const b = index.get(s.to)!;
			const kind = s.kind ?? 'call';
			const lines = wrapText(withMark(s.label, s.change), LABEL_MAX, LABEL_FONT, live);
			const width = widest(lines, LABEL_FONT, live);
			const lo = Math.min(a, b);
			const hi = Math.max(a, b);
			if (kind === 'note') {
				if (hi > lo) widen(lo, hi, width + 16 - 32);
			} else if (a === b) {
				if (a < gaps.length) widen(a, a + 1, Math.max(width + 8, LOOP) + 16);
			} else widen(lo, hi, width + 28);
			return { step: s, a, b, kind, lines, width };
		});

	const xs = [0];
	for (const g of gaps) xs.push(xs[xs.length - 1] + g);

	const actors: ActorLayout[] = data.actors.map((a, i) => {
		const h = heads[i];
		const box = { x: xs[i] - h.width / 2, y: PAD, width: h.width, height: HEAD };
		const start = xs[i] - (h.icon + h.text) / 2;
		return {
			key: a.key,
			kind: a.kind,
			label: h.label,
			x: xs[i],
			box,
			iconX: start + 8,
			textX: start + h.icon
		};
	});

	let y = PAD + HEAD + 18;
	const laid: StepLayout[] = [];
	for (const { step, a, b, kind, lines, width } of steps) {
		const block = lines.length * LINE;
		const base = { key: step.key, change: step.change, lines };
		if (kind === 'note') {
			const lo = Math.min(a, b);
			const hi = Math.max(a, b);
			const w = lo === hi ? Math.max(width + 16, 80) : Math.max(xs[hi] - xs[lo] + 32, width + 16);
			const cx = (xs[lo] + xs[hi]) / 2;
			const box = { x: cx - w / 2, y, width: w, height: block + 10 };
			laid.push({
				...base,
				type: 'note',
				box,
				badge: { x: box.x + box.width, y: box.y },
				text: { x: cx, y: y + 5 + LINE - 3.5 }
			});
			y += box.height + 14;
			continue;
		}
		const style = kind;
		const filled = style === 'call';
		if (a === b) {
			const x = xs[a];
			const top = y + block + 4;
			const bottom = top + 18;
			const tip = { x, y: bottom };
			const head = filled
				? triangle(tip, { x: -1, y: 0 }, 9, 4.5)
				: openArrow(tip, { x: -1, y: 0 }, 9, 5);
			const box = { x, y: y - 2, width: Math.max(width + 8, LOOP) + 4, height: bottom - y + 6 };
			laid.push({
				...base,
				type: 'self',
				style,
				points: [{ x, y: top }, { x: x + LOOP, y: top }, { x: x + LOOP, y: bottom }, head.stop],
				head: { d: head.d, filled },
				box,
				badge: { x: box.x + box.width + 4, y: y + 4 },
				text: { x: x + 8, y: y + LINE - 3.5 }
			});
			y = bottom + 14;
			continue;
		}
		const x1 = xs[a];
		const x2 = xs[b];
		const arrowY = y + block + 4;
		const tip = { x: x2, y: arrowY };
		const dir = { x: Math.sign(x2 - x1), y: 0 };
		const head = filled ? triangle(tip, dir, 9, 4.5) : openArrow(tip, dir, 9, 5);
		const cx = (x1 + x2) / 2;
		laid.push({
			...base,
			type: 'message',
			style,
			line: [{ x: x1, y: arrowY }, head.stop],
			head: { d: head.d, filled },
			box: { x: Math.min(x1, x2), y: y - 2, width: Math.abs(x2 - x1), height: block + 10 },
			badge: { x: cx + width / 2 + 9, y: y + 4 },
			text: { x: cx, y: y + LINE - 3.5 }
		});
		y = arrowY + 14;
	}

	const bottom = Math.max(y - 4, PAD + HEAD + 24);
	const all = bounds([...actors.map((a) => a.box), ...laid.map((s) => s.box)]);
	return {
		width: all.width + PAD * 2,
		height: bottom + PAD,
		dx: PAD - all.x,
		actors,
		lifeline: { top: PAD + HEAD, bottom },
		steps: laid
	};
}
