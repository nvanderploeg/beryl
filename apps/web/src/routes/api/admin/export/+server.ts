import { Readable } from 'node:stream';
import type { RequestHandler } from './$types';
import { adminRoute } from '#lib/server/admin/auth.ts';
import { bundleName, exportBundle } from '#lib/server/admin/bundle.ts';
import { log } from '#lib/server/log.ts';

export const GET: RequestHandler = adminRoute(() => {
	log('admin.export');
	return new Response(Readable.toWeb(Readable.from(exportBundle())) as ReadableStream, {
		headers: {
			'content-type': 'application/zip',
			'content-disposition': `attachment; filename="${bundleName()}"`,
			'cache-control': 'no-store'
		}
	});
});
