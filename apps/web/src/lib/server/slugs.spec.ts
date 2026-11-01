import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '#lib/server/db/index.ts';
import { projects, topics } from '#lib/server/db/schema.ts';
import { backfillSlugs, resolveProjectId, resolveTopicId } from '#lib/server/store.ts';
import { resetDb } from '#lib/server/test/db.ts';
import { api, seedProject, seedTopic } from '#lib/server/test/http.ts';

beforeEach(resetDb);

describe('Project slugs', () => {
	it('numbers a name that is already claimed', async () => {
		const slugs = [];
		for (let i = 0; i < 3; i++)
			slugs.push((await api.createProject({ name: 'Runestone' })).body.slug);
		expect(slugs).toEqual(['runestone', 'runestone-2', 'runestone-3']);
	});

	it('resolves by slug or by id', async () => {
		const project = await seedProject('Runestone');
		expect(await resolveProjectId('runestone')).toBe(project.id);
		expect(await resolveProjectId(project.id)).toBe(project.id);
		expect(await resolveProjectId('nope')).toBeUndefined();
	});
});

describe('Project slugs at the length cap', () => {
	it('keeps numbering a name that fills the cap', async () => {
		const name = 'a'.repeat(60);
		const slugs = [];
		for (let i = 0; i < 4; i++) slugs.push((await api.createProject({ name })).body.slug);
		expect(new Set(slugs).size).toBe(4);
		expect(slugs.every((s) => s.length <= 48)).toBe(true);
	});
});

describe('Topic slugs', () => {
	it('numbers a title already claimed in the same Project only', async () => {
		const a = await seedProject('a');
		const b = await seedProject('b');
		const slugs = [];
		for (const project of [a, a, b])
			slugs.push((await seedTopic(project, { title: 'Plan' })).topic.slug);
		expect(slugs).toEqual(['plan', 'plan-2', 'plan']);
	});

	it('resolves by slug or by id, inside its Project', async () => {
		const a = await seedProject('a');
		const b = await seedProject('b');
		const { topicId } = await seedTopic(a, { title: 'Plan' });
		expect(await resolveTopicId(a.id, 'plan')).toBe(topicId);
		expect(await resolveTopicId(a.id, topicId)).toBe(topicId);
		expect(await resolveTopicId(b.id, 'plan')).toBeUndefined();
		expect(await resolveTopicId(b.id, topicId)).toBeUndefined();
	});

	it('keeps its slug when the title changes', async () => {
		const project = await seedProject('a');
		const { topicId } = await seedTopic(project, { title: 'Plan' });
		await api.patchTopic(topicId, { title: 'Something else' }, project.writeKey);
		expect(await resolveTopicId(project.id, 'plan')).toBe(topicId);
	});
});

describe('backfillSlugs', () => {
	it('gives rows without a slug one, oldest first, and leaves claimed slugs alone', async () => {
		const first = await seedProject('Runestone');
		const second = await seedProject('Runestone');
		const t1 = await seedTopic(first, { title: 'Plan' });
		const t2 = await seedTopic(first, { title: 'Plan' });
		await db.update(projects).set({ slug: null });
		await db.update(topics).set({ slug: null });

		await backfillSlugs();

		const slug = async (id: string) =>
			(await db.select().from(projects).where(eq(projects.id, id)))[0].slug;
		expect([await slug(first.id), await slug(second.id)].sort()).toEqual([
			'runestone',
			'runestone-2'
		]);
		const topicSlug = async (id: string) =>
			(await db.select().from(topics).where(eq(topics.id, id)))[0].slug;
		expect([await topicSlug(t1.topicId), await topicSlug(t2.topicId)].sort()).toEqual([
			'plan',
			'plan-2'
		]);
	});
});
