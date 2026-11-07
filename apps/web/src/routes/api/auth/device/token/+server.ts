import type { RequestHandler } from './$types';
import { ApiError, readBody, route } from '#lib/server/api.ts';
import { exchangeDeviceCode } from '#lib/server/logins.ts';

export const POST: RequestHandler = route(async ({ request }) => {
	const { deviceCode } = await readBody(request);
	if (typeof deviceCode !== 'string' || deviceCode === '') {
		throw new ApiError(400, 'deviceCode is required');
	}
	const result = await exchangeDeviceCode(deviceCode);
	return Response.json(result, {
		status: 'pending' in result ? 202 : 200,
		headers: { 'cache-control': 'no-store' }
	});
});
