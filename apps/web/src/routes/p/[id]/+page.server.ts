import { error } from '@sveltejs/kit';
import { getProjectPage, resolveProjectId } from '#lib/server/store.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const projectId = await resolveProjectId(params.id);
	const page = projectId && (await getProjectPage(projectId));
	if (!page) error(404, 'Project not found');
	return page;
};
