import { error } from '@sveltejs/kit';
import { getProjectPage } from '#lib/server/store.ts';
import { isUuid } from '#lib/ui/ids.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	if (!isUuid(params.id)) error(404, 'Project not found');
	const page = await getProjectPage(params.id);
	if (!page) error(404, 'Project not found');
	return page;
};
