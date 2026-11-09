import { beforeEach, describe, expect, it, vi } from 'vitest';

const inserts: string[] = [];
vi.mock('#lib/server/db/index.ts', () => ({
	db: {
		insert: () => ({
			values: (row: { uid: string }) => ({
				onConflictDoNothing: async () => void inserts.push(row.uid)
			})
		})
	}
}));

const { ensureUser, forgetUsers, KNOWN_USERS_MAX } = await import('#lib/server/users.ts');
const user = (uid: string) => ({ uid, email: null, name: null });

describe('ensureUser', () => {
	beforeEach(() => {
		forgetUsers();
		inserts.length = 0;
	});

	it('writes a uid once while it is remembered', async () => {
		await ensureUser(user('a'));
		await ensureUser(user('a'));
		expect(inserts).toEqual(['a']);
	});

	it('bounds what it remembers, writing a forgotten uid again', async () => {
		for (let i = 0; i < KNOWN_USERS_MAX; i++) await ensureUser(user(`u${i}`));
		await ensureUser(user('overflow'));
		await ensureUser(user('u0'));
		expect(inserts.filter((uid) => uid === 'u0')).toHaveLength(2);
	});
});
