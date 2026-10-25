import type { TableData } from '../types.ts';

export function elements(data: TableData): { key: string; label: string }[] {
	return data.rows.map((row) => {
		const first = row.cells[0];
		const text = typeof first === 'string' ? first.replace(/\s+/g, ' ').trim() : '';
		const label = text || row.key;
		return { key: row.key, label };
	});
}
