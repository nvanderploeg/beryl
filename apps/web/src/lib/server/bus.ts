import type { BerylEvent } from '#lib/types.ts';

type Listener = (event: BerylEvent) => void;

const listeners = new Map<string, Set<Listener>>();

export function subscribe(topicId: string, listener: Listener): () => void {
	let set = listeners.get(topicId);
	if (!set) listeners.set(topicId, (set = new Set()));
	set.add(listener);
	return () => {
		set.delete(listener);
		if (set.size === 0 && listeners.get(topicId) === set) listeners.delete(topicId);
	};
}

export function publish(topicId: string, event: BerylEvent): void {
	for (const listener of [...(listeners.get(topicId) ?? [])]) {
		try {
			listener(event);
		} catch (error) {
			console.error('beryl bus listener failed', error);
		}
	}
}

export function listenerCount(topicId: string): number {
	return listeners.get(topicId)?.size ?? 0;
}
