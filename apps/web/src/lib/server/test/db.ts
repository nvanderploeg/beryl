import { DATABASE_URL } from '$app/env/private';
import { forgetUsers } from '#lib/server/users.ts';
import { db } from '#lib/server/db/index.ts';
import {
	deviceCodes,
	events,
	loginTokens,
	nodes,
	notes,
	pairings,
	projects,
	sessions,
	topics,
	users
} from '#lib/server/db/schema.ts';

export async function resetDb(): Promise<void> {
	forgetUsers();
	const database = new URL(DATABASE_URL).pathname.slice(1);
	if (!database.endsWith('_test')) {
		throw new Error(`refusing to wipe "${database}": tests need a database named *_test`);
	}
	await db.delete(events);
	await db.delete(notes);
	await db.delete(nodes);
	await db.delete(topics);
	await db.delete(pairings);
	await db.delete(sessions);
	await db.delete(users);
	await db.delete(deviceCodes);
	await db.delete(loginTokens);
	await db.delete(projects);
}
