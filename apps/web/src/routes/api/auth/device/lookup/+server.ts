import type { RequestHandler } from './$types';
import { ApiError, readBody, route } from '#lib/server/api.ts';
import { cookieUser } from '#lib/server/login.ts';
import { limitLookup, peekDeviceCode } from '#lib/server/logins.ts';

// What a person sees before approving. Everything but `startedAt` comes from the requester.
export const POST: RequestHandler = route(async ({ request, getClientAddress }) => {
	if (!(await cookieUser(request))) throw new ApiError(401, 'sign in required');
	limitLookup(getClientAddress());
	const { userCode } = await readBody(request);
	if (typeof userCode !== 'string' || userCode === '')
		throw new ApiError(400, 'userCode is required');
	const pending = await peekDeviceCode(userCode);
	if (!pending) throw new ApiError(404, 'unknown or expired code');
	return Response.json(
		{
			label: pending.label,
			ip: pending.ip,
			userAgent: pending.userAgent,
			startedSecondsAgo: Math.max(0, Math.round((Date.now() - pending.startedAt.getTime()) / 1000))
		},
		{ headers: { 'cache-control': 'no-store' } }
	);
});
