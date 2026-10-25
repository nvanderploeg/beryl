import { subscribe } from '#lib/server/bus.ts';
import { sentQueuedCount } from '#lib/server/store.ts';

export function waitForSent(
	topicId: string,
	timeoutMs: number,
	signal?: AbortSignal
): Promise<number> {
	return new Promise((resolve, reject) => {
		let done = false;
		// Subscribe before counting so a Send landing between the two is never missed.
		const unsubscribe = subscribe(topicId, (event) => {
			if (event.type === 'send') finish((event.payload as { count: number }).count);
		});
		const timer = setTimeout(() => finish(0), timeoutMs);
		const onAbort = () => finish(0);
		signal?.addEventListener('abort', onAbort, { once: true });

		function cleanup(): boolean {
			if (done) return false;
			done = true;
			unsubscribe();
			clearTimeout(timer);
			signal?.removeEventListener('abort', onAbort);
			return true;
		}

		function finish(sent: number): void {
			if (cleanup()) resolve(sent);
		}

		if (signal?.aborted) return finish(0);
		sentQueuedCount(topicId).then(
			(sent) => {
				if (sent > 0) finish(sent);
			},
			(error) => {
				if (cleanup()) reject(error);
			}
		);
	});
}
