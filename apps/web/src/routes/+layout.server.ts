import { ApiError } from '#lib/server/api.ts';
import { webConfig } from '#lib/server/firebase.ts';
import { loginUser } from '#lib/server/login.ts';
import type { LayoutServerLoad } from './$types';

// A verifier outage must not lock a person out of the public pages, /login included.
async function signedInUser(request: Request) {
	try {
		return await loginUser(request);
	} catch (error) {
		if (error instanceof ApiError && error.status === 503) return null;
		throw error;
	}
}

export const load: LayoutServerLoad = async ({ request }) => ({
	user: await signedInUser(request),
	authEnabled: webConfig() !== undefined
});
