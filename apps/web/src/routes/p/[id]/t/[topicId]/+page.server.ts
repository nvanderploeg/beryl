import { error } from '@sveltejs/kit';
import { getSnapshot, resolveProjectId, resolveTopicId } from '#lib/server/store.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const projectId = await resolveProjectId(params.id);
	const topicId = projectId && (await resolveTopicId(projectId, params.topicId));
	const snapshot = topicId && (await getSnapshot(topicId));
	if (!snapshot) error(404, 'Topic not found');
	return { snapshot };
};
