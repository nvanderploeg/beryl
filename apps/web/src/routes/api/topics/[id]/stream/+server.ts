import type { RequestHandler } from './$types';
import { ApiError, parseId, route } from '#lib/server/api.ts';
import { log } from '#lib/server/log.ts';
import { parseSince } from '#lib/server/parse.ts';
import { createTopicStream } from '#lib/server/stream.ts';

export const GET: RequestHandler = route(async ({ request, params, url, getClientAddress }) => {
	const topicId = parseId(params.id, 'topic');
	const since = parseSince(request.headers.get('last-event-id') || url.searchParams.get('since'));
	const ip = getClientAddress();
	const openedAt = Date.now();
	const stream = await createTopicStream(topicId, {
		since,
		onClose: (reason) =>
			log('stream.close', {
				topic: topicId,
				ip,
				reason,
				seconds: Math.round((Date.now() - openedAt) / 1000)
			})
	});
	if (!stream) throw new ApiError(404, 'topic not found');
	log('stream.open', { topic: topicId, ip, since });
	return new Response(stream, {
		headers: {
			'content-type': 'text/event-stream',
			'cache-control': 'no-cache',
			'x-accel-buffering': 'no'
		}
	});
});
