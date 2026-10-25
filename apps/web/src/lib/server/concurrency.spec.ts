import { beforeEach, describe, expect, it } from 'vitest';
import { resetDb } from '#lib/server/test/db.ts';
import { api, seedProject, seedTopic, type Seeded } from '#lib/server/test/http.ts';

let project: Seeded;

beforeEach(async () => {
	await resetDb();
	project = await seedProject();
});

describe('concurrent writes in one Project', () => {
	// Inserting a Topic share-locks its Project row through the foreign key check, and every write
	// ends by bumping that row's lastWriteAt. Sibling writes racing a Topic being opened must all
	// land: a deadlock victim answers 500, which the client reports as an unreachable board.
	it('opening a Topic never deadlocks with writes to its siblings', async () => {
		const { topicId } = await seedTopic(project);
		const nodes = Array.from({ length: 100 }, (_, i) => ({ path: `area/n${i}`, kind: 'fact' }));
		for (let round = 0; round < 6; round++) {
			const results = await Promise.all([
				api.createTopic(project.id, { title: `Round ${round}`, nodes }, project.writeKey),
				api.putNodes(topicId, { nodes: [{ path: `a${round}`, kind: 'fact' }] }, project.writeKey),
				api.addNote(
					topicId,
					{ anchor: { path: null }, intent: 'comment', text: `round ${round}` },
					project.noteKey
				),
				api.createTopic(project.id, { title: `Twin ${round}`, nodes }, project.writeKey)
			]);
			expect(results.map((r) => r.status)).toEqual([201, 200, 201, 201]);
		}
	});
});
