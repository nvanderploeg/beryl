import { error } from '@sveltejs/kit';
import { readableTopic } from '#lib/server/auth.ts';
import { getSnapshot, resolveProjectId, resolveTopicId } from '#lib/server/store.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, request }) => {
	const projectId = await resolveProjectId(params.id);
	const topicId = projectId && (await resolveTopicId(projectId, params.topicId));
	if (topicId) await readableTopic(request, topicId).catch(() => error(404, 'Topic not found'));
	const snapshot = topicId && (await getSnapshot(topicId));
	if (!snapshot) error(404, 'Topic not found');
	return { snapshot };
};
