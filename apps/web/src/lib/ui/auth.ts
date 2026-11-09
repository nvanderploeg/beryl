import type { FirebaseApp } from 'firebase/app';
import type { Auth, User } from 'firebase/auth';

interface Started {
	app: FirebaseApp;
	auth: Auth;
}

const EMAIL_KEY = 'beryl.emailForSignIn';

let started: Promise<Started> | undefined;

export class AuthOff extends Error {}

async function start(): Promise<Started> {
	const res = await fetch('/api/auth/config');
	const body = await res.json();
	if (!body.enabled) throw new AuthOff('sign-in is not configured on this server');
	const { initializeApp } = await import('firebase/app');
	const { getAuth } = await import('firebase/auth');
	const app = initializeApp(body.config);
	return { app, auth: getAuth(app) };
}

const firebase = () =>
	(started ??= start().catch((error) => ((started = undefined), Promise.reject(error))));

// Same-origin paths only, so a crafted `next` cannot bounce a signed-in person elsewhere.
export function safeNext(raw: string | null): string {
	if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return '/';
	// Browsers drop tab and newline inside a URL, turning `/\t/host` into `//host`.
	if ([...raw].some((c) => c <= '\u001f' || c === '\u007f')) return '/';
	try {
		const base = 'http://safe.invalid';
		return new URL(raw, base).origin === base ? raw : '/';
	} catch {
		return '/';
	}
}

async function establish(user: User): Promise<void> {
	const res = await fetch('/api/auth/session', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ idToken: await user.getIdToken() })
	});
	if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? 'sign-in failed');
}

export async function signInWithGoogle(): Promise<void> {
	const { auth } = await firebase();
	const { GoogleAuthProvider, signInWithPopup } = await import('firebase/auth');
	const { user } = await signInWithPopup(auth, new GoogleAuthProvider());
	await establish(user);
}

export async function sendEmailLink(email: string, next: string): Promise<void> {
	const { auth } = await firebase();
	const { sendSignInLinkToEmail } = await import('firebase/auth');
	const url = new URL('/login', location.origin);
	url.searchParams.set('next', next);
	await sendSignInLinkToEmail(auth, email, { url: url.toString(), handleCodeInApp: true });
	try {
		localStorage.setItem(EMAIL_KEY, email);
	} catch {
		/* the link page asks for the address instead */
	}
}

export async function isEmailLink(): Promise<boolean> {
	const { auth } = await firebase();
	const { isSignInWithEmailLink } = await import('firebase/auth');
	return isSignInWithEmailLink(auth, location.href);
}

export function rememberedEmail(): string | null {
	try {
		return localStorage.getItem(EMAIL_KEY);
	} catch {
		return null;
	}
}

export async function completeEmailLink(email: string): Promise<void> {
	const { auth } = await firebase();
	const { signInWithEmailLink } = await import('firebase/auth');
	const { user } = await signInWithEmailLink(auth, email, location.href);
	try {
		localStorage.removeItem(EMAIL_KEY);
	} catch {
		/* nothing stored */
	}
	await establish(user);
}

export async function signOut(): Promise<void> {
	await fetch('/api/auth/session', { method: 'DELETE' });
	if (!started) return;
	try {
		const { auth } = await started;
		const { signOut: out } = await import('firebase/auth');
		await out(auth);
	} catch {
		/* the cookie is already gone */
	}
}
