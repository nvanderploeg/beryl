import demo from '#lib/fixtures/demo-grill.json' with { type: 'json' };
import { foldHistory, turnStart } from '#lib/fixtures/fold.ts';
import type { DemoFixture } from '#lib/fixtures/types.ts';
import type { PageLoad } from './$types';

const fixture = demo as DemoFixture;

export const load: PageLoad = ({ url }) => {
	const total = fixture.turns.length;
	const raw = Number.parseInt(url.searchParams.get('turn') ?? '', 10);
	const turn = Number.isNaN(raw) ? total : Math.max(0, Math.min(total, raw));
	const { snapshot, events } = foldHistory(fixture, turn);
	return {
		snapshot,
		events,
		turn,
		total,
		says: fixture.turns.map((t) => t.say ?? ''),
		since: turn > 0 ? turnStart(turn) : null
	};
};
