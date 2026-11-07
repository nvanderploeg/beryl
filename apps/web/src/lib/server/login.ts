import { AUTH_COOKIE_DOMAIN } from '$app/env/private';
import { ApiError } from '#lib/server/api.ts';
import { verifier, type LoginUser } from '#lib/server/firebase.ts';
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

// A bad or expired cookie is signed out, not an error.
export async function verifyCookie(cookie: string | undefined): Promise<LoginUser | null> {
	const check = verifier();
	if (!cookie || !check) return null;
	let user: LoginUser;
	try {
		user = await check.verifySessionCookie(cookie);
	} catch {
		return null;
	}
	await ensureUser(user);
	return user;
}

export const cookieUser = (request: Request) => verifyCookie(cookieValue(request, COOKIE));

// Bearers that are neither a Write key nor a Session token are Firebase ID tokens.
const isIdToken = (key: string) => !/^b[a-z]_/.test(key) && key.split('.').length === 3;

// An agent's Bearer is a Firebase ID token, verified (and revocation-checked) per request.
export async function loginUser(request: Request): Promise<LoginUser | null> {
	const key = /^Bearer\s+(\S+)\s*$/i.exec(request.headers.get('authorization') ?? '')?.[1];
	if (key && isIdToken(key)) {
		const check = verifier();
		if (!check) throw new ApiError(503, 'sign-in is not configured');
		let user: LoginUser;
		try {
			user = await check.verifyIdToken(key);
		} catch {
			throw new ApiError(401, 'invalid login token');
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

// Strict, so a cross-site request never carries the cookie.
export function sessionCookie(
	value: string,
	secure: boolean,
	maxAgeMs: number,
	domain = AUTH_COOKIE_DOMAIN
): string {
	const attrs = ['Path=/', 'HttpOnly', 'SameSite=Strict', `Max-Age=${Math.floor(maxAgeMs / 1000)}`];
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
		log('login.refused', { error: error instanceof Error ? error.message : String(error) });
		throw new ApiError(401, 'invalid sign-in');
	}
}
