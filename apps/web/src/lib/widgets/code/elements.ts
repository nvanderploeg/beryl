import type { CodeData } from '../types.ts';
import { splitLines } from '../shared/lines.ts';

export function elements(data: CodeData): { key: string; label: string }[] {
	return splitLines(data.code).map((_, i) => ({
		key: `L${i + 1}`,
		label: data.filename ? `${data.filename}:${i + 1}` : `line ${i + 1}`
	}));
}
