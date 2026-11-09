import { ORIGIN } from '$app/env/private';
import { authenticatesByBearer } from '#lib/server/bearer.ts';

export function publicOrigin(url: URL): string {
	return ORIGIN ?? url.origin;
}

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

// An unsafe request that rides the ambient session cookie must come from this site's own pages.
// Same-site is not enough: sibling apps share the cookie.
export function crossSiteCookieWrite(request: Request, url: URL, cookieName: string): boolean {
	if (SAFE.has(request.method)) return false;
	if (authenticatesByBearer(request)) return false;
	const cookies = request.headers.get('cookie') ?? '';
	if (!cookies.split(';').some((part) => part.trim().startsWith(`${cookieName}=`))) return false;
	const site = request.headers.get('sec-fetch-site');
	if (site !== null) return site !== 'same-origin' && site !== 'none';
	return request.headers.get('origin') !== publicOrigin(url);
}
