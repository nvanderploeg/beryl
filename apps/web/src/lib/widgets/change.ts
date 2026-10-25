import type { Change } from './types.ts';

export function changeColor(change: Change | 'kept' | undefined): string | undefined {
	switch (change) {
		case 'added':
			return 'var(--added)';
		case 'removed':
			return 'var(--removed)';
		case 'changed':
		case 'renamed':
			return 'var(--changed)';
		default:
			return undefined;
	}
}

export function changeSymbol(change: Change | 'kept' | undefined): string {
	switch (change) {
		case 'added':
			return '+';
		case 'removed':
			return '−';
		case 'changed':
			return '~';
		case 'renamed':
			return '→';
		default:
			return '';
	}
}
