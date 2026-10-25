import type { MigrationData } from '../types.ts';
import { stepLabel } from './labels.ts';

export function elements(data: MigrationData): { key: string; label: string }[] {
	return data.steps.flatMap((step) => {
		const label = stepLabel(step);
		return [
			{ key: step.key, label },
			...(step.columns ?? []).map((column) => ({
				key: `${step.key}.${column.name}`,
				label: `${label} › ${column.name}`
			})),
			...(step.rows?.items ?? []).map((row) => ({
				key: `${step.key}#${row.key}`,
				label: `${label} › row ${row.key}`
			}))
		];
	});
}
