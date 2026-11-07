import { redirect } from '@sveltejs/kit';
import { safeNext } from '#lib/ui/auth.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, parent }) => {
	const { user } = await parent();
	if (user) redirect(303, safeNext(url.searchParams.get('next')));
	return {};
};
