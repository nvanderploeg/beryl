import type { Cell } from '../types.ts';

export type CellKind = 'null' | 'true' | 'false' | 'number' | 'text';

export function cellKind(cell: Cell): CellKind {
	if (cell === null) return 'null';
	if (cell === true) return 'true';
	if (cell === false) return 'false';
	if (typeof cell === 'number') return 'number';
	return 'text';
}

export function cellText(cell: Cell, nullText = '—'): string {
	switch (cellKind(cell)) {
		case 'null':
			return nullText;
		case 'true':
			return '✓';
		case 'false':
			return '–';
		default:
			return String(cell);
	}
}
