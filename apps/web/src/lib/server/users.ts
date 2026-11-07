import { db } from '#lib/server/db/index.ts';
import { users } from '#lib/server/db/schema.ts';
import type { LoginUser } from '#lib/server/firebase.ts';

const known = new Set<string>();

export async function ensureUser(user: LoginUser): Promise<void> {
	if (known.has(user.uid)) return;
	await db
		.insert(users)
		.values({ uid: user.uid, email: user.email, name: user.name })
		.onConflictDoNothing();
	known.add(user.uid);
}

export const forgetUsers = () => known.clear();
