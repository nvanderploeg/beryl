// Stub: the server builder replaces this.
import type { Project, Snapshot, TopicSummary } from '#lib/types.ts';

export async function getSnapshot(_topicId: string): Promise<Snapshot | undefined> {
	return undefined;
}

export async function getProjectPage(
	_projectId: string
): Promise<{ project: Project; topics: TopicSummary[] } | undefined> {
	return undefined;
}
