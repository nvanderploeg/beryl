import { ApiError } from '#lib/server/api.ts';
import { verifier } from '#lib/server/firebase.ts';
import { endStreams } from '#lib/server/stream.ts';
import { privateTopicIds } from '#lib/server/store.ts';

// Revokes every Firebase refresh token of the user and closes the streams of their private Topics.
export async function revokeEverywhere(uid: string): Promise<void> {
	const check = verifier();
	if (!check) throw new ApiError(503, 'sign-in is not configured');
	try {
		await check.revokeRefreshTokens(uid);
	} finally {
		endStreams(await privateTopicIds(uid));
	}
}
