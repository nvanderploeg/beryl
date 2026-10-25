export interface Point {
	x: number;
	y: number;
}

export interface Box {
	x: number;
	y: number;
	width: number;
	height: number;
}

export function direction(from: Point, to: Point): Point {
	const dx = to.x - from.x;
	const dy = to.y - from.y;
	const length = Math.hypot(dx, dy) || 1;
	return { x: dx / length, y: dy / length };
}

export function along(p: Point, dir: Point, distance: number): Point {
	return { x: p.x + dir.x * distance, y: p.y + dir.y * distance };
}

function corners(tip: Point, dir: Point, length: number, half: number) {
	const base = along(tip, dir, -length);
	const normal = { x: -dir.y, y: dir.x };
	return {
		base,
		left: along(base, normal, half),
		right: along(base, normal, -half)
	};
}

const fmt = (p: Point) => `${round(p.x)} ${round(p.y)}`;
const round = (n: number) => Math.round(n * 10) / 10;

// Heads point along dir and end at tip; each returns the path and where the line should stop.
export function triangle(tip: Point, dir: Point, length = 11, half = 6) {
	const c = corners(tip, dir, length, half);
	return { d: `M${fmt(tip)} L${fmt(c.left)} L${fmt(c.right)} Z`, stop: c.base };
}

export function diamond(tip: Point, dir: Point, length = 16, half = 6) {
	const c = corners(tip, dir, length / 2, half);
	const back = along(tip, dir, -length);
	return { d: `M${fmt(tip)} L${fmt(c.left)} L${fmt(back)} L${fmt(c.right)} Z`, stop: back };
}

export function openArrow(tip: Point, dir: Point, length = 10, half = 5.5) {
	const c = corners(tip, dir, length, half);
	return { d: `M${fmt(c.left)} L${fmt(tip)} L${fmt(c.right)}`, stop: tip };
}

export function polyline(points: Point[], radius = 0): string {
	if (points.length === 0) return '';
	let d = `M${fmt(points[0])}`;
	for (let i = 1; i < points.length; i++) {
		const p = points[i];
		const next = points[i + 1];
		if (!radius || !next) {
			d += ` L${fmt(p)}`;
			continue;
		}
		const prev = points[i - 1];
		const r = Math.min(
			radius,
			Math.hypot(p.x - prev.x, p.y - prev.y) / 2,
			Math.hypot(next.x - p.x, next.y - p.y) / 2
		);
		const a = along(p, direction(p, prev), r);
		const b = along(p, direction(p, next), r);
		d += ` L${fmt(a)} Q${fmt(p)} ${fmt(b)}`;
	}
	return d;
}

export function bounds(boxes: Box[], points: Point[] = []): Box {
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const b of boxes) {
		minX = Math.min(minX, b.x);
		minY = Math.min(minY, b.y);
		maxX = Math.max(maxX, b.x + b.width);
		maxY = Math.max(maxY, b.y + b.height);
	}
	for (const p of points) {
		minX = Math.min(minX, p.x);
		minY = Math.min(minY, p.y);
		maxX = Math.max(maxX, p.x);
		maxY = Math.max(maxY, p.y);
	}
	if (minX === Infinity) return { x: 0, y: 0, width: 0, height: 0 };
	return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

// The middle of the longest segment: where a badge on a path sits.
export function midpoint(points: Point[]): Point {
	let best = { length: -1, at: points[0] ?? { x: 0, y: 0 } };
	for (let i = 1; i < points.length; i++) {
		const a = points[i - 1];
		const b = points[i];
		const length = Math.hypot(b.x - a.x, b.y - a.y);
		if (length > best.length) best = { length, at: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
	}
	return best.at;
}
