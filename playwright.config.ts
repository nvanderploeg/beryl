import { defineConfig } from '@playwright/test';

const PORT = 3271;

export default defineConfig({
	testDir: 'e2e',
	fullyParallel: false,
	workers: 1,
	use: { baseURL: `http://127.0.0.1:${PORT}` },
	webServer: {
		command: 'pnpm --filter web dev --host 127.0.0.1',
		url: `http://127.0.0.1:${PORT}/api/health`,
		reuseExistingServer: !process.env.CI,
		env: {
			ADMIN_TOKEN: process.env.ADMIN_TOKEN ?? 'e2e-admin-token-0123456789',
			DATABASE_URL: process.env.E2E_DATABASE_URL ?? 'mysql://beryl:beryl@127.0.0.1:3326/beryl_e2e'
		}
	}
});
