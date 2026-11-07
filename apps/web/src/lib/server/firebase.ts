import { readFileSync } from 'node:fs';
import { cert, getApps, initializeApp, type ServiceAccount } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import {
	FIREBASE_APP_ID,
	FIREBASE_AUTH_DOMAIN,
	FIREBASE_SERVICE_ACCOUNT,
	FIREBASE_SERVICE_ACCOUNT_FILE,
	FIREBASE_WEB_API_KEY
} from '$app/env/private';

export interface LoginUser {
	uid: string;
	email: string | null;
	name: string | null;
}

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
		const decoded = await auth.verifyIdToken(idToken);
		if (Date.now() / 1000 - decoded.auth_time > FRESH_SIGN_IN_S) {
			throw new Error('sign-in is too old');
		}
		return auth.createSessionCookie(idToken, { expiresIn: ttlMs });
	},
	async verifySessionCookie(cookie) {
		const decoded = await firebaseAuth().verifySessionCookie(cookie);
		return { uid: decoded.uid, email: decoded.email ?? null, name: decoded.name ?? null };
	},
	async verifyIdToken(idToken) {
		const decoded = await firebaseAuth().verifyIdToken(idToken, true);
		return { uid: decoded.uid, email: decoded.email ?? null, name: decoded.name ?? null };
	},
	createCustomToken: (uid) => firebaseAuth().createCustomToken(uid),
	revokeRefreshTokens: (uid) => firebaseAuth().revokeRefreshTokens(uid)
};

function configured(): boolean {
	return Boolean(FIREBASE_SERVICE_ACCOUNT || FIREBASE_SERVICE_ACCOUNT_FILE);
}

export function verifier(): Verifier | undefined {
	return override ?? (configured() ? real : undefined);
}

// What the sign-in page needs to start Firebase in the browser; undefined means sign-in is off.
export function webConfig(): WebConfig | undefined {
	if (override) return overrideConfig;
	if (!configured() || !FIREBASE_WEB_API_KEY) return undefined;
	const projectId = credentials()?.projectId;
	if (!projectId) return undefined;
	return {
		apiKey: FIREBASE_WEB_API_KEY,
		authDomain: FIREBASE_AUTH_DOMAIN ?? `${projectId}.firebaseapp.com`,
		projectId,
		...(FIREBASE_APP_ID ? { appId: FIREBASE_APP_ID } : {})
	};
}
