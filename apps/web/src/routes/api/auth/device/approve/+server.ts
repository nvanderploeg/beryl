import type { RequestHandler } from './$types';
import { ApiError, readBody, route } from '#lib/server/api.ts';
import { cookieUser } from '#lib/server/login.ts';
import { approveDeviceCode, limitApproval } from '#lib/server/logins.ts';

export const POST: RequestHandler = route(async ({ request, getClientAddress }) => {
	const user = await cookieUser(request);
	if (!user) throw new ApiError(401, 'sign in required');
	limitApproval(getClientAddress());
	const { userCode } = await readBody(request);
	if (typeof userCode !== 'string' || userCode === '')
		throw new ApiError(400, 'userCode is required');
	return Response.json(await approveDeviceCode(userCode, user.uid));
});
