import { ApiError } from '#lib/server/api.ts';
import { verifier, type LoginUser } from '#lib/server/firebase.ts';
import { log } from '#lib/server/log.ts';

export type { LoginUser };

export const COOKIE = 'beryl_session';
export const COOKIE_TTL_MS = 5 * 24 * 60 * 60 * 1000;

function cookieValue(request: Request, name: string): string | undefined {
	for (const part of (request.headers.get('cookie') ?? '').split(';')) {
		const at = part.indexOf('=');
		if (at > 0 && part.slice(0, at).trim() === name) return part.slice(at + 1).trim();
	}
	return undefined;
}

// A bad or expired cookie is signed out, not an error.
export async function verifyCookie(cookie: string | undefined): Promise<LoginUser | null> {
	const check = verifier();
	if (!cookie || !check) return null;
	try {
		return await check.verifySessionCookie(cookie);
	} catch {
		return null;
	}
}

export const loginUser = (request: Request) => verifyCookie(cookieValue(request, COOKIE));

export async function requireLogin(request: Request): Promise<LoginUser> {
	const user = await loginUser(request);
	if (!user) throw new ApiError(401, 'sign in required');
	return user;
}

// Strict, so a cross-site request never carries the cookie.
export function sessionCookie(value: string, secure: boolean, maxAgeMs: number): string {
	const attrs = ['Path=/', 'HttpOnly', 'SameSite=Strict', `Max-Age=${Math.floor(maxAgeMs / 1000)}`];
	if (secure) attrs.push('Secure');
	return `${COOKIE}=${value}; ${attrs.join('; ')}`;
}

export async function exchangeIdToken(idToken: string): Promise<string> {
	const check = verifier();
	if (!check) throw new ApiError(503, 'sign-in is not configured');
	try {
		return await check.createSessionCookie(idToken, COOKIE_TTL_MS);
	} catch (error) {
		log('login.refused', { error: error instanceof Error ? error.message : String(error) });
		throw new ApiError(401, 'invalid sign-in');
	}
}
