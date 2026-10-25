import type {
	EdgeRel,
	Node,
	NodeKind,
	NodeStatus,
	NoteIntent,
	NoteStatus,
	Note
} from '../types.ts';
import { isUnknown } from './topic.ts';

export const KIND_LABEL: Record<NodeKind, string> = {
	area: 'Area',
	decision: 'Question',
	assumption: 'Assumption',
	fact: 'Fact',
	term: 'Term',
	fog: 'Fog',
	constraint: 'Constraint',
	risk: 'Risk'
};

export const STATUS_LABEL: Record<NodeStatus, string> = {
	open: 'Open',
	settled: 'Settled',
	parked: 'Parked',
	dropped: 'Dropped'
};

export const REL_LABEL: Record<EdgeRel, { out: string; in: string }> = {
	relies_on: { out: 'Relies on', in: 'Relied on by' },
	relates: { out: 'Relates to', in: 'Related from' },
	conflicts: { out: 'Conflicts with', in: 'Conflicted by' },
	supersedes: { out: 'Supersedes', in: 'Superseded by' }
};

export const INTENT_LABEL: Record<NoteIntent, string> = {
	answer: 'Answer',
	accept: 'Accept',
	correct: 'Correct',
	comment: 'Comment',
	explore: 'Explore',
	defer: 'Defer',
	drop: 'Drop'
};

export const INTENT_HINT: Record<NoteIntent, string> = {
	answer: 'Your answer to the question',
	accept: 'Take the recommendation, or confirm the assumption',
	correct: 'What the agent has wrong',
	comment: 'A remark for the agent',
	explore: 'Ask the agent to dig into this',
	defer: 'Park it for later',
	drop: 'Take it out of scope'
};

export const TEXT_REQUIRED: readonly NoteIntent[] = ['answer', 'correct', 'comment', 'explore'];

export function noteStage(note: Note): 'queued' | 'sent' | 'delivered' | 'resolved' {
	if (note.status === 'queued') return note.sentAt ? 'sent' : 'queued';
	return note.status;
}

export const STAGE_LABEL: Record<ReturnType<typeof noteStage> | NoteStatus, string> = {
	queued: 'Queued',
	sent: 'Sent',
	delivered: 'With the agent',
	resolved: 'Resolved'
};

export type Tone =
	'unknown' | 'fog' | 'risk' | 'assume' | 'settled' | 'parked' | 'dropped' | 'quiet';

export function toneOf(node: Pick<Node, 'kind' | 'status'>): Tone {
	if (node.status === 'dropped') return 'dropped';
	if (node.status === 'parked') return 'parked';
	if (node.kind === 'fog') return node.status === 'open' ? 'fog' : 'settled';
	if (isUnknown(node as Node)) {
		if (node.kind === 'risk') return 'risk';
		if (node.kind === 'assumption') return 'assume';
		return 'unknown';
	}
	if (node.status === 'settled') return 'settled';
	return 'quiet';
}

export function firstLine(text: string): string {
	return (
		text
			.split('\n')
			.find((l) => l.trim())
			?.trim() ?? ''
	);
}
