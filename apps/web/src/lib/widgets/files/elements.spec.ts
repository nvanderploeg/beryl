import { describe, expect, it } from 'vitest';
import demo from '#lib/fixtures/demo-grill.json' with { type: 'json' };
import type { DemoFixture } from '#lib/fixtures/types.ts';
import type { Widget } from '#lib/types.ts';
import { elementsOf } from '../elements.ts';
import type { FileEntry } from '../types.ts';
import { buildTree, treeRows } from './tree.ts';

function fixtureWidget(path: string, key: string): Widget {
	const found = (demo as DemoFixture).turns
		.flatMap((t) => t.nodes ?? [])
		.filter((n) => n.path === path)
		.flatMap((n) => n.widgets ?? [])
		.findLast((w) => w.key === key);
	if (!found) throw new Error(`no widget ${path} ${key}`);
	return found;
}

describe('files elements', () => {
	it('lists file paths in tree order: directories first, then files, by name', () => {
		const list = elementsOf(fixtureWidget('ui/switcher', 'files'));
		expect(list.map((e) => e.key)).toEqual([
			'src/lib/components/Header.svelte',
			'src/lib/components/OwnerBadge.svelte',
			'src/lib/server/db/schema.ts',
			'src/routes/r/[key]/+page.svelte',
			'src/routes/w/[slug]/+layout.server.ts',
			'src/routes/w/[slug]/+layout.svelte'
		]);
		expect(list.every((e) => e.label === e.key)).toBe(true);
	});

	it('has the Element the fixture note pins to', () => {
		const keys = elementsOf(fixtureWidget('ui/switcher', 'files')).map((e) => e.key);
		expect(keys).toContain('src/routes/w/[slug]/+layout.svelte');
	});
});

describe('files tree', () => {
	const files: FileEntry[] = [
		{ path: 'README.md', change: 'changed', added: 1, removed: 1 },
		{ path: 'a/b/c/deep.ts', change: 'added', added: 10 },
		{ path: 'a/b/c/other.ts', change: 'removed', removed: 4 },
		{ path: 'a/top.ts' },
		{ path: 'a/b/d/x.ts', change: 'renamed', from: 'a/b/d/y.ts', added: 2, removed: 2 }
	];

	it('joins a directory that holds only one directory with it', () => {
		const rows = treeRows(buildTree([{ path: 'x/y/z/f.ts' }, { path: 'x/g.ts' }]));
		expect(rows.map((r) => (r.kind === 'dir' ? `${r.dir.name}/` : r.node.name))).toEqual([
			'x/',
			'y/z/',
			'f.ts',
			'g.ts'
		]);
	});

	it('aggregates change counts and line counts per directory', () => {
		const tree = buildTree(files);
		const a = tree.dirs[0];
		expect(a.name).toBe('a');
		expect(a.total).toBe(4);
		expect(a.added).toBe(12);
		expect(a.removed).toBe(6);
		expect(a.counts).toEqual({ added: 1, removed: 1, changed: 0, renamed: 1 });
		expect(tree.added).toBe(13);
	});

	it('nests rows by depth and hides what a collapsed directory holds', () => {
		const tree = buildTree(files);
		const open = treeRows(tree);
		expect(open.map((r) => [r.kind === 'dir' ? r.dir.path : r.node.file.path, r.depth])).toEqual([
			['a', 0],
			['a/b', 1],
			['a/b/c', 2],
			['a/b/c/deep.ts', 3],
			['a/b/c/other.ts', 3],
			['a/b/d', 2],
			['a/b/d/x.ts', 3],
			['a/top.ts', 1],
			['README.md', 0]
		]);
		const closed = treeRows(tree, new Set(['a/b']));
		expect(closed.map((r) => (r.kind === 'dir' ? r.dir.path : r.node.file.path))).toEqual([
			'a',
			'a/b',
			'a/top.ts',
			'README.md'
		]);
	});
});
