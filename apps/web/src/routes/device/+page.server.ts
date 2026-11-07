import { redirect } from '@sveltejs/kit';
import { peekDeviceCode } from '#lib/server/logins.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, parent }) => {
	const { user } = await parent();
	const code = url.searchParams.get('code') ?? '';
	if (!user) redirect(303, `/login?next=${encodeURIComponent(`/device${url.search}`)}`);
	const pending = code ? await peekDeviceCode(code) : undefined;
	return { code, label: pending?.label ?? null };
};
