import type { RequestHandler } from './$types';
import { readBody, route } from '#lib/server/api.ts';
import { DEVICE_INTERVAL_S, createDeviceCode } from '#lib/server/logins.ts';
import { publicOrigin } from '#lib/server/origin.ts';
import { parseDeviceLabel } from '#lib/server/parse.ts';

export const POST: RequestHandler = route(async ({ request, url, getClientAddress }) => {
	const label = parseDeviceLabel(await readBody(request));
	const { deviceCode, userCode, expiresAt } = await createDeviceCode(label, {
		ip: getClientAddress(),
		userAgent: request.headers.get('user-agent') ?? ''
	});
	return Response.json(
		{
			deviceCode,
			userCode,
			verificationUrl: `${publicOrigin(url)}/device`,
			expiresAt: expiresAt.toISOString(),
			interval: DEVICE_INTERVAL_S
		},
		{ status: 201 }
	);
});
