import type { ApiData } from '../types.ts';

export function elements(data: ApiData): { key: string; label: string }[] {
	return data.endpoints.map((e) => ({ key: e.key, label: `${e.method} ${e.path}` }));
}
