import { error } from '@sveltejs/kit';
import { loginUser } from '#lib/server/login.ts';
import { getProjectPage, resolveProjectId } from '#lib/server/store.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, request }) => {
	const projectId = await resolveProjectId(params.id);
	const page =
		projectId && (await getProjectPage(projectId, (await loginUser(request))?.uid ?? null));
	if (!page) error(404, 'Project not found');
	return page;
};
