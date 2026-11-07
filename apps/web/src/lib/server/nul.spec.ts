import { beforeEach, describe, expect, it } from 'vitest';
import { resetDb } from '#lib/server/test/db.ts';
import { api, seedProject, seedTopic } from '#lib/server/test/http.ts';

beforeEach(resetDb);

describe('NUL characters in text', () => {
	it('are refused with a 400 on every text input', async () => {
		const nul = 'x\u0000y';
		expect((await api.createProject({ name: nul })).status).toBe(400);

		const project = await seedProject('nul');
		expect((await api.createTopic(project.id, { title: nul }, project.writeKey)).status).toBe(400);

		const { topicId } = await seedTopic(project);
		const put = await api.putNodes(
			topicId,
			{ nodes: [{ path: 'a', kind: 'fact', title: 'A', body: nul }] },
			project.writeKey
		);
		expect(put.status).toBe(400);
		expect(put.body.error).toMatch(/NUL/);
		expect((await api.patchTopic(topicId, { summary: nul }, project.writeKey)).status).toBe(400);
		expect(
			(
				await api.addNote(
					topicId,
					{ anchor: { path: null }, intent: 'comment', text: nul },
					project.noteKey
				)
			).status
		).toBe(400);
	});
});
