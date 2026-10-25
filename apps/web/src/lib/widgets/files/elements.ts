import type { FilesData } from '../types.ts';
import { filesInOrder } from './tree.ts';

export function elements(data: FilesData): { key: string; label: string }[] {
	return filesInOrder(data.files).map((file) => ({ key: file.path, label: file.path }));
}
