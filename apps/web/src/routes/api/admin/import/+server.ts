import { rm } from 'node:fs/promises';
import type { RequestHandler } from './$types';
import { adminRoute } from '#lib/server/admin/auth.ts';
import { ADMIN_MAX_BUNDLE_MB } from '$app/env/private';
import { IMPORT_CONFIRM } from '#lib/admin-confirm.ts';
import { ApiError } from '#lib/server/api.ts';
import { importBundle, receiveUpload } from '#lib/server/admin/bundle.ts';

export const POST: RequestHandler = adminRoute(async ({ request, url }) => {
	if (url.searchParams.get('confirm') !== IMPORT_CONFIRM) {
		throw new ApiError(400, `add ?confirm=${IMPORT_CONFIRM} to replace the whole database`);
	}
	const { dir, path } = await receiveUpload(request, ADMIN_MAX_BUNDLE_MB * 1024 * 1024);
	try {
		return Response.json(
			await importBundle(path, { allowEmpty: url.searchParams.get('allowEmpty') === '1' })
		);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});
