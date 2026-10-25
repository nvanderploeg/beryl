import type { MigrationStep } from '../types.ts';

export function stepLabel(step: MigrationStep): string {
	if (step.op === 'rename' && step.to) return `rename ${step.table} → ${step.to}`;
	return `${step.op} ${step.table}`;
}
