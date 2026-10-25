import { error } from '@sveltejs/kit';
import { getSnapshot } from '#lib/server/store.ts';
import { isUuid } from '#lib/ui/ids.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	if (!isUuid(params.id) || !isUuid(params.topicId)) error(404, 'Topic not found');
	const snapshot = await getSnapshot(params.topicId);
	if (!snapshot || snapshot.project.id !== params.id) error(404, 'Topic not found');
	return { snapshot };
};
