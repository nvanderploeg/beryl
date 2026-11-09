import { AUTH_COOKIE_DOMAIN } from '$app/env/private';
import { ApiError } from '#lib/server/api.ts';
import { AuthRejected, verifier, type LoginUser } from '#lib/server/firebase.ts';
import { bearerOf, isIdToken } from '#lib/server/bearer.ts';
import { ensureUser } from '#lib/server/users.ts';
import { log } from '#lib/server/log.ts';

export type { LoginUser };

export const COOKIE = 'runestone_session';
export const COOKIE_TTL_MS = 5 * 24 * 60 * 60 * 1000;

function cookieValue(request: Request, name: string): string | undefined {
	for (const part of (request.headers.get('cookie') ?? '').split(';')) {
		const at = part.indexOf('=');
		if (at > 0 && part.slice(0, at).trim() === name) return part.slice(at + 1).trim();
	}
	return undefined;
}

function unavailable(error: unknown): ApiError {
	log('login.unavailable', { error: error instanceof Error ? error.message : String(error) });
	return new ApiError(503, 'sign-in is unavailable; retry shortly');
}

// A bad, expired or revoked cookie is signed out; a verifier outage is a 503.
export async function verifyCookie(cookie: string | undefined): Promise<LoginUser | null> {
	const check = verifier();
	if (!cookie || !check) return null;
	let user: LoginUser;
	try {
		user = await check.verifySessionCookie(cookie);
	} catch (error) {
		if (error instanceof AuthRejected) return null;
		throw unavailable(error);
	}
	await ensureUser(user);
	return user;
}

export const cookieUser = (request: Request) => verifyCookie(cookieValue(request, COOKIE));

// An agent's Bearer is a Firebase ID token, verified (and revocation-checked) per request.
export async function loginUser(request: Request): Promise<LoginUser | null> {
	const key = bearerOf(request);
	if (key && isIdToken(key)) {
		const check = verifier();
		if (!check) throw new ApiError(503, 'sign-in is not configured');
		let user: LoginUser;
		try {
			user = await check.verifyIdToken(key);
		} catch (error) {
			if (error instanceof AuthRejected) throw new ApiError(401, 'invalid login token');
			throw unavailable(error);
		}
		await ensureUser(user);
		return user;
	}
	return cookieUser(request);
}

export async function requireCookie(request: Request): Promise<LoginUser> {
	const user = await cookieUser(request);
	if (!user) throw new ApiError(401, 'sign in required');
	return user;
}

// Lax: a link followed from another site arrives signed in. Unsafe requests are origin-checked.
export function sessionCookie(
	value: string,
	secure: boolean,
	maxAgeMs: number,
	domain = AUTH_COOKIE_DOMAIN
): string {
	const attrs = ['Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${Math.floor(maxAgeMs / 1000)}`];
	if (domain) attrs.push(`Domain=${domain}`);
	if (secure) attrs.push('Secure');
	return `${COOKIE}=${value}; ${attrs.join('; ')}`;
}

export async function exchangeIdToken(idToken: string): Promise<string> {
	const check = verifier();
	if (!check) throw new ApiError(503, 'sign-in is not configured');
	try {
		return await check.createSessionCookie(idToken, COOKIE_TTL_MS);
	} catch (error) {
		if (!(error instanceof AuthRejected)) throw unavailable(error);
		log('login.refused', { error: error.message });
		throw new ApiError(401, 'invalid sign-in');
	}
}
