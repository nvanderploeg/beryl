import type { FileEntry } from '../types.ts';
import { countChanges, type ChangeCounts } from '../shared/counts.ts';

export interface DirNode {
	name: string; // one segment, or several joined by '/' where a directory holds only one directory
	path: string; // full path of the deepest segment in `name`; '' for the root
	dirs: DirNode[];
	files: FileNode[];
	counts: ChangeCounts;
	added: number;
	removed: number;
	total: number; // files beneath
}

export interface FileNode {
	name: string;
	file: FileEntry;
}

export type TreeRow =
	{ kind: 'dir'; dir: DirNode; depth: number } | { kind: 'file'; node: FileNode; depth: number };

function compare(a: string, b: string): number {
	const x = a.toLowerCase();
	const y = b.toLowerCase();
	if (x !== y) return x < y ? -1 : 1;
	return a < b ? -1 : a > b ? 1 : 0;
}

function emptyDir(name: string, path: string): DirNode {
	return {
		name,
		path,
		dirs: [],
		files: [],
		counts: countChanges([]),
		added: 0,
		removed: 0,
		total: 0
	};
}

function finish(dir: DirNode, entries: FileEntry[]): DirNode {
	dir.dirs.sort((a, b) => compare(a.name, b.name));
	dir.files.sort((a, b) => compare(a.name, b.name));
	dir.dirs = dir.dirs.map((child) => {
		const below = entries.filter((f) => f.path.startsWith(child.path + '/'));
		let node = finish(child, below);
		while (node.files.length === 0 && node.dirs.length === 1) {
			const only = node.dirs[0];
			node = { ...only, name: `${node.name}/${only.name}` };
		}
		return node;
	});
	dir.counts = countChanges(entries);
	dir.added = entries.reduce((sum, f) => sum + (f.added ?? 0), 0);
	dir.removed = entries.reduce((sum, f) => sum + (f.removed ?? 0), 0);
	dir.total = entries.length;
	return dir;
}

export function buildTree(files: FileEntry[]): DirNode {
	const root = emptyDir('', '');
	const dirs = new Map<string, DirNode>([['', root]]);
	for (const file of files) {
		const parts = file.path.split('/').filter(Boolean);
		const name = parts.pop() ?? file.path;
		let parent = root;
		let path = '';
		for (const part of parts) {
			path = path ? `${path}/${part}` : part;
			let dir = dirs.get(path);
			if (!dir) {
				dir = emptyDir(part, path);
				dirs.set(path, dir);
				parent.dirs.push(dir);
			}
			parent = dir;
		}
		parent.files.push({ name, file });
	}
	return finish(root, files);
}

export function treeRows(root: DirNode, collapsed: ReadonlySet<string> = new Set()): TreeRow[] {
	const rows: TreeRow[] = [];
	const walk = (dir: DirNode, depth: number) => {
		for (const child of dir.dirs) {
			rows.push({ kind: 'dir', dir: child, depth });
			if (!collapsed.has(child.path)) walk(child, depth + 1);
		}
		for (const node of dir.files) rows.push({ kind: 'file', node, depth });
	};
	walk(root, 0);
	return rows;
}

export function filesInOrder(files: FileEntry[]): FileEntry[] {
	return treeRows(buildTree(files)).flatMap((row) => (row.kind === 'file' ? [row.node.file] : []));
}
