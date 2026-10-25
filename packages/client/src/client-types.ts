import type {
	AgentInfo,
	Anchor,
	Node,
	NodeInput,
	Note,
	NoteIntent,
	Pulled,
	Snapshot,
	Topic,
	TopicStatus
} from './types.ts';

export interface ClientOptions {
	env?: Record<string, string | undefined>;
	configDir?: string;
	fetch?: typeof fetch;
	candidates?: string[];
	probeTimeoutMs?: number;
	remoteProbeTimeoutMs?: number;
	requestTimeoutMs?: number;
	sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

export type Result<T> = { ok: true; value: T } | { ok: false; warning: string };

export interface OpenTopicInput {
	title?: string;
	destination?: string;
	summary?: string;
	nodes?: NodeInput[];
	agent?: AgentInfo;
	repo?: string;
	branch?: string;
	project?: string;
	topicId?: string;
	cwd?: string;
}

export interface OpenedTopic {
	topicId: string;
	url: string;
	noteUrl: string;
	projectUrl: string;
	server: string;
	projectId: string;
	createdProject: boolean;
	resumed: boolean;
}

export interface UpdateTopicInput {
	topicId: string;
	title?: string;
	destination?: string;
	summary?: string;
	status?: TopicStatus;
	current?: string | null;
	agent?: AgentInfo;
}

export interface ResolveInput {
	id: string;
	reply?: string;
	changed?: string[];
}

export interface PalantirClient {
	discover(): Promise<string | null>;
	openTopic(input: OpenTopicInput): Promise<Result<OpenedTopic>>;
	getTopic(input: {
		topicId: string;
	}): Promise<Result<{ snapshot: Snapshot; url: string; noteUrl: string }>>;
	putNodes(input: { topicId: string; nodes: NodeInput[] }): Promise<Result<{ nodes: Node[] }>>;
	removeNodes(input: { topicId: string; paths: string[] }): Promise<Result<{ removed: string[] }>>;
	moveNode(input: {
		topicId: string;
		from: string;
		to: string;
	}): Promise<Result<{ moved: { from: string; to: string }[] }>>;
	updateTopic(input: UpdateTopicInput): Promise<Result<{ topic: Topic }>>;
	pullNotes(input: { topicId: string }): Promise<Result<Pulled>>;
	resolveNotes(input: {
		topicId: string;
		notes: ResolveInput[];
	}): Promise<Result<{ notes: Note[] }>>;
	waitForSent(input: {
		topicId: string;
		timeoutMs?: number;
		pollMs?: number;
		signal?: AbortSignal;
	}): Promise<Result<{ sent: number }>>;
	addNote(input: {
		topicId: string;
		anchor: Anchor;
		intent: NoteIntent;
		text?: string;
		author?: string;
	}): Promise<Result<{ note: Note }>>;
	send(input: { topicId: string }): Promise<Result<{ sent: number }>>;
	topicUrl(input: { topicId: string; private?: boolean }): Promise<Result<{ url: string }>>;
	doctor(input?: { cwd?: string }): Promise<DoctorReport>;
}

export interface DoctorReport {
	configDir: string;
	pinned: string | null;
	probes: { server: string; ok: boolean; version?: string }[];
	server: string | null;
	repoKey: string;
	registered: { projectId: string; name: string } | null;
	registryError: string | null;
}
