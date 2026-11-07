import { readFileSync } from 'node:fs';
import { cert, getApps, initializeApp, type ServiceAccount } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import {
	FIREBASE_APP_ID,
	FIREBASE_AUTH_DOMAIN,
	FIREBASE_PROJECT_ID,
	FIREBASE_SERVICE_ACCOUNT,
	FIREBASE_SERVICE_ACCOUNT_FILE,
	FIREBASE_WEB_API_KEY
} from '$app/env/private';

export interface LoginUser {
	uid: string;
	email: string | null;
	name: string | null;
}

// verify* reject with AuthRejected when the credential is bad; any other error is an outage.
export interface Verifier {
	createSessionCookie(idToken: string, ttlMs: number): Promise<string>;
	verifySessionCookie(cookie: string): Promise<LoginUser>;
	// Rejects a revoked token as well as a bad one.
	verifyIdToken(idToken: string): Promise<LoginUser>;
	createCustomToken(uid: string): Promise<string>;
	revokeRefreshTokens(uid: string): Promise<void>;
}

export interface WebConfig {
	apiKey: string;
	authDomain: string;
	projectId: string;
	appId?: string;
}

// A sign-in older than this cannot be traded for a session cookie.
const FRESH_SIGN_IN_S = 5 * 60;

// The credential itself is bad: invalid, expired or revoked. Anything else a verifier throws is
// the infrastructure failing.
export class AuthRejected extends Error {}

const REJECTED_CODES = new Set([
	'auth/argument-error',
	'auth/id-token-expired',
	'auth/id-token-revoked',
	'auth/session-cookie-expired',
	'auth/session-cookie-revoked',
	'auth/invalid-id-token',
	'auth/invalid-session-cookie',
	'auth/user-disabled',
	'auth/user-not-found'
]);

async function classified<T>(run: () => Promise<T>): Promise<T> {
	try {
		return await run();
	} catch (error) {
		const code = (error as { code?: unknown } | null)?.code;
		if (typeof code === 'string' && REJECTED_CODES.has(code)) {
			throw new AuthRejected(error instanceof Error ? error.message : code);
		}
		throw error;
	}
}

interface SignInClaims {
	auth_time: number;
	firebase?: { sign_in_provider?: string };
}

// A session cookie outlives the agents it could otherwise be minted from: custom-token sign-ins
// (device logins) never qualify.
export function assertBrowserSignIn(decoded: SignInClaims, nowMs: number): void {
	if (decoded.firebase?.sign_in_provider === 'custom') {
		throw new AuthRejected('device logins cannot start a browser session');
	}
	if (nowMs / 1000 - decoded.auth_time > FRESH_SIGN_IN_S) {
		throw new AuthRejected('sign-in is too old');
	}
}

export const REVOCATION_CACHE_MS = 5000;

// Remembers successful checks briefly; a revocation made through this server clears them.
export function withRevocationCache(inner: Verifier, now: () => number = Date.now): Verifier {
	const seen = new Map<string, { user: LoginUser; until: number }>();
	const remember =
		(check: (credential: string) => Promise<LoginUser>, kind: string) =>
		async (credential: string) => {
			const key = `${kind}:${credential}`;
			const hit = seen.get(key);
			if (hit && hit.until > now()) return hit.user;
			const user = await check(credential);
			if (seen.size >= 1000) seen.clear();
			seen.set(key, { user, until: now() + REVOCATION_CACHE_MS });
			return user;
		};
	return {
		...inner,
		verifySessionCookie: remember((c) => inner.verifySessionCookie(c), 'cookie'),
		verifyIdToken: remember((t) => inner.verifyIdToken(t), 'id'),
		async revokeRefreshTokens(uid) {
			await inner.revokeRefreshTokens(uid);
			seen.clear();
		}
	};
}

let override: Verifier | undefined;
let overrideConfig: WebConfig | undefined;

// Tests install a fake; undefined restores the Firebase-backed verifier.
export function setVerifier(verifier: Verifier | undefined, config?: WebConfig): void {
	override = verifier;
	overrideConfig = config;
}

let loaded: ServiceAccount | undefined;

function credentials(): ServiceAccount | undefined {
	if (loaded) return loaded;
	const json = FIREBASE_SERVICE_ACCOUNT
		? FIREBASE_SERVICE_ACCOUNT
		: FIREBASE_SERVICE_ACCOUNT_FILE
			? readFileSync(FIREBASE_SERVICE_ACCOUNT_FILE, 'utf8')
			: undefined;
	if (!json) return undefined;
	const raw = JSON.parse(json);
	loaded = {
		projectId: raw.project_id,
		clientEmail: raw.client_email,
		privateKey: raw.private_key
	};
	return loaded;
}

function firebaseAuth() {
	const app =
		getApps()[0] ??
		(() => {
			const account = credentials();
			if (!account) throw new Error('no Firebase service account configured');
			return initializeApp({ credential: cert(account), projectId: account.projectId });
		})();
	return getAuth(app);
}

const real: Verifier = {
	async createSessionCookie(idToken, ttlMs) {
		const auth = firebaseAuth();
		return classified(async () => {
			assertBrowserSignIn(await auth.verifyIdToken(idToken, true), Date.now());
			return auth.createSessionCookie(idToken, { expiresIn: ttlMs });
		});
	},
	verifySessionCookie: (cookie) =>
		classified(async () => {
			const decoded = await firebaseAuth().verifySessionCookie(cookie, true);
			return { uid: decoded.uid, email: decoded.email ?? null, name: decoded.name ?? null };
		}),
	verifyIdToken: (idToken) =>
		classified(async () => {
			const decoded = await firebaseAuth().verifyIdToken(idToken, true);
			return { uid: decoded.uid, email: decoded.email ?? null, name: decoded.name ?? null };
		}),
	createCustomToken: (uid) => firebaseAuth().createCustomToken(uid),
	revokeRefreshTokens: (uid) => firebaseAuth().revokeRefreshTokens(uid)
};

const cachedReal = withRevocationCache(real);

function configured(): boolean {
	return Boolean(FIREBASE_SERVICE_ACCOUNT || FIREBASE_SERVICE_ACCOUNT_FILE);
}

export function verifier(): Verifier | undefined {
	return override ?? (configured() ? cachedReal : undefined);
}

// What the sign-in page needs to start Firebase in the browser; undefined means sign-in is off.
export function webConfig(): WebConfig | undefined {
	if (override) return overrideConfig;
	if (!configured() || !FIREBASE_WEB_API_KEY) return undefined;
	return {
		apiKey: FIREBASE_WEB_API_KEY,
		authDomain: FIREBASE_AUTH_DOMAIN,
		projectId: FIREBASE_PROJECT_ID,
		...(FIREBASE_APP_ID ? { appId: FIREBASE_APP_ID } : {})
	};
}
