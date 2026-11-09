export const bearerOf = (request: Request): string | undefined =>
	/^Bearer\s+(\S+)\s*$/i.exec(request.headers.get('authorization') ?? '')?.[1];

// Bearers that are neither a Write key nor a Session token are Firebase ID tokens.
export const isIdToken = (key: string) => !/^b[a-z]_/.test(key) && key.split('.').length === 3;

// An ID-token Bearer authenticates the request on its own; the cookie is never consulted.
export const authenticatesByBearer = (request: Request): boolean => {
	const key = bearerOf(request);
	return key !== undefined && isIdToken(key);
};
