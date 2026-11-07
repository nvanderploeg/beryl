import type { RequestHandler } from './$types';
import { ApiError, readBody, route } from '#lib/server/api.ts';
import { verifier, webConfig } from '#lib/server/firebase.ts';
import { exchangeDeviceCode } from '#lib/server/logins.ts';

// The agent trades `customToken` at Firebase (accounts:signInWithCustomToken with `apiKey`) for an
// ID token and a refresh token; it never holds a credential issued by this app.
export const POST: RequestHandler = route(async ({ request }) => {
	const { deviceCode } = await readBody(request);
	if (typeof deviceCode !== 'string' || deviceCode === '') {
		throw new ApiError(400, 'deviceCode is required');
	}
	const check = verifier();
	const config = webConfig();
	if (!check || !config) throw new ApiError(503, 'sign-in is not configured');
	const result = await exchangeDeviceCode(deviceCode);
	const body =
		'pending' in result
			? result
			: {
					uid: result.uid,
					customToken: await check.createCustomToken(result.uid),
					apiKey: config.apiKey
				};
	return Response.json(body, {
		status: 'pending' in result ? 202 : 200,
		headers: { 'cache-control': 'no-store' }
	});
});
