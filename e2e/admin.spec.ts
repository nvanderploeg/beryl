import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const TOKEN = process.env.ADMIN_TOKEN ?? 'e2e-admin-token-0123456789';

async function login(page: import('@playwright/test').Page) {
	await page.goto('/admin');
	await page.getByLabel('Admin token').fill(TOKEN);
	await page.getByRole('button', { name: 'Log in' }).click();
	await expect(page.getByRole('heading', { name: 'Health' })).toBeVisible();
}

test('refuses a wrong token, accepts the right one', async ({ page }) => {
	await page.goto('/admin');
	await page.getByLabel('Admin token').fill('wrong-wrong-wrong-wrong');
	await page.getByRole('button', { name: 'Log in' }).click();
	await expect(page.getByTestId('message')).toContainText('wrong admin token');
	await login(page);
	await expect(page.getByText('applied 0002_project_topic_slugs')).toBeAttached();
});

test('API needs the token: 401 without, 200 with Bearer', async ({ request }) => {
	expect((await request.get('/api/admin/stats')).status()).toBe(401);
	const ok = await request.get('/api/admin/stats', {
		headers: { authorization: `Bearer ${TOKEN}` }
	});
	expect(ok.status()).toBe(200);
});

test('export, delete with typed confirmation, then import restores it', async ({
	page,
	request
}) => {
	const name = `E2E ${Date.now()}`;
	const created = await request.post('/api/projects', { data: { name } });
	expect(created.status()).toBe(201);

	await login(page);
	const card = page.getByTestId('project').filter({ hasText: name });
	await expect(card).toBeVisible();

	const [download] = await Promise.all([
		page.waitForEvent('download'),
		page.getByRole('link', { name: 'Download bundle' }).click()
	]);
	const bundle = await download.path();
	expect((await readFile(bundle)).subarray(0, 2).toString()).toBe('PK');

	await card.getByRole('button', { name: 'Delete' }).first().click();
	await page.getByLabel('Confirm name').fill('not the name');
	await page.getByRole('button', { name: 'Delete forever' }).click();
	await expect(page.getByTestId('message')).toContainText('confirm must equal');
	await page.getByLabel('Confirm name').fill(name);
	await page.getByRole('button', { name: 'Delete forever' }).click();
	await expect(card).toHaveCount(0);

	await page.getByLabel('Bundle file').setInputFiles(bundle);
	const replace = page.getByRole('button', { name: 'Replace everything' });
	await expect(replace).toBeDisabled();
	await page.getByLabel('Import confirmation').fill('replace-everything');
	await replace.click();
	await expect(page.getByTestId('message')).toContainText('Imported schema');
	await expect(page.getByTestId('project').filter({ hasText: name })).toBeVisible();
});
