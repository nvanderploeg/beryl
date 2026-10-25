import type { SchemaData } from '../types.ts';

export function elements(data: SchemaData): { key: string; label: string }[] {
	return data.tables.flatMap((table) => [
		{ key: table.name, label: table.name },
		...table.columns.map((column) => ({
			key: `${table.name}.${column.name}`,
			label: `${table.name}.${column.name}`
		})),
		...(table.indexes ?? []).map((index) => ({
			key: `${table.name}#${index.name}`,
			label: `index ${index.name} on ${table.name}`
		}))
	]);
}
