import { describe, expect, it } from 'vitest';
import demo from '#lib/fixtures/demo-grill.json' with { type: 'json' };
import type { DemoFixture } from '#lib/fixtures/types.ts';
import { elementsOf } from '#lib/widgets/elements.ts';
import { validateWidget } from '#lib/widgets/validate.ts';
import { fakeMarks, fixtureEntries, sampleEntries } from './gallery.ts';
import { samples } from './samples.ts';

const fixture = demo as DemoFixture;

describe('widget gallery', () => {
	it('shows every widget write in the fixture, with its turn and version', () => {
		const entries = fixtureEntries(fixture);
		const writes = fixture.turns.flatMap((t) => (t.nodes ?? []).flatMap((n) => n.widgets ?? []));
		expect(entries).toHaveLength(writes.length);
		expect(new Set(entries.map((e) => e.id)).size).toBe(entries.length);
		const plans = entries.filter((e) => e.path === 'migration/plan');
		expect(plans.map((e) => [e.turn, e.version])).toEqual([
			[3, 1],
			[4, 2]
		]);
	});

	it('finds an Element for every Element the fixture notes pin to', () => {
		const pinned = fixtureEntries(fixture).filter((e) => e.notes.length);
		expect(pinned.flatMap((e) => e.notes).sort()).toEqual([
			'backfill-workspaces#u-17',
			'backfill-workspaces#u-17',
			'labours.parent_id',
			'memberships.role',
			'memberships.role',
			'src/routes/w/[slug]/+layout.svelte'
		]);
		for (const entry of pinned) {
			const keys = elementsOf(entry.widget).map((e) => e.key);
			for (const key of entry.notes) expect(keys).toContain(key);
		}
	});

	it('only marks Elements that exist', () => {
		for (const entry of [...fixtureEntries(fixture), ...sampleEntries(samples)]) {
			const keys = new Set(elementsOf(entry.widget).map((e) => e.key));
			for (const key of Object.keys(fakeMarks(entry))) expect(keys).toContain(key);
		}
	});

	it('uses samples that pass validation', () => {
		for (const { widget } of samples) {
			expect(validateWidget(widget), widget.key).toMatchObject({ ok: true });
		}
	});
});
