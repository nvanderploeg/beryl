import type { Widget } from '#lib/types.ts';
import type { DemoFixture } from '#lib/fixtures/types.ts';
import { elementsOf } from '#lib/widgets/elements.ts';

export interface GalleryEntry {
	id: string;
	source: 'fixture' | 'sample';
	path: string;
	turn?: number; // 1-based: the state after that many turns
	version: number; // 1 for a widget's first appearance, counting later writes of the same path and key
	widget: Widget;
	notes: string[]; // Element keys the fixture's Notes pin on this widget
}

export function fixtureEntries(fixture: DemoFixture): GalleryEntry[] {
	const seen = new Map<string, number>();
	const entries: GalleryEntry[] = [];
	const anchors = fixture.turns.flatMap((turn) => turn.notes ?? []).map((note) => note.anchor);
	fixture.turns.forEach((turn, t) => {
		for (const node of turn.nodes ?? []) {
			for (const widget of node.widgets ?? []) {
				const id = `${node.path}:${widget.key}`;
				const version = (seen.get(id) ?? 0) + 1;
				seen.set(id, version);
				const notes = anchors
					.filter((a) => a.path === node.path && a.widget === widget.key && a.element)
					.map((a) => a.element as string);
				entries.push({
					id: `${id}@${t + 1}`,
					source: 'fixture',
					path: node.path,
					turn: t + 1,
					version,
					widget,
					notes
				});
			}
		}
	});
	return entries;
}

export function sampleEntries(samples: { path: string; widget: Widget }[]): GalleryEntry[] {
	return samples.map(({ path, widget }) => ({
		id: `sample:${path}:${widget.key}`,
		source: 'sample',
		path,
		version: 1,
		widget,
		notes: []
	}));
}

export function fakeMarks(entry: GalleryEntry): Record<string, number> {
	const keys = elementsOf(entry.widget).map((e) => e.key);
	const marks: Record<string, number> = {};
	const add = (key: string | undefined, n: number) => {
		if (key !== undefined) marks[key] = (marks[key] ?? 0) + n;
	};
	for (const key of entry.notes) add(key, 1);
	if (keys.length > 1) add(keys[1], 2);
	if (keys.length > 3) add(keys[keys.length - 1], 1);
	return marks;
}
