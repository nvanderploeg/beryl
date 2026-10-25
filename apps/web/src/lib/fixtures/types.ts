import type { Anchor, NodeInput, NoteIntent, TopicStatus } from '#lib/types.ts';

// One agent turn of a scripted grill, applied in field order: pull, resolve, remove, move, nodes,
// topic, then the person's notes and send.
export interface DemoTurn {
	say?: string; // the question the agent asked in the terminal this turn
	nodes?: NodeInput[];
	remove?: string[];
	move?: { from: string; to: string }[];
	topic?: { current?: string | null; summary?: string; status?: TopicStatus };
	notes?: { anchor: Anchor; intent: NoteIntent; text?: string; author?: string }[];
	send?: boolean; // the person pressed Send after adding this turn's notes
	pull?: boolean; // the agent pulled every queued note at the start of this turn
	resolve?: { note: number; reply: string; changed?: string[] }[]; // note: index over all notes so far
}

export interface DemoFixture {
	project: { name: string };
	topic: { title: string; destination?: string; summary?: string };
	turns: DemoTurn[];
}
