import { webConfig } from '#lib/server/firebase.ts';
import { loginUser } from '#lib/server/login.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ request }) => ({
	user: await loginUser(request),
	authEnabled: webConfig() !== undefined
});
