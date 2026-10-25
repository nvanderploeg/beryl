export const UNREACHABLE_WARNING = 'beryl unreachable — continuing without the board';

export type Failure = { ok: false; warning: string; status?: number; retryAfterMs?: number };
export type Reply<T> = { ok: true; status: number; body: T } | Failure;

export interface RequestInit {
	method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
	key?: string;
	body?: unknown;
	signal?: AbortSignal;
}

export function normaliseServer(url: string): string {
	return url.trim().replace(/\/+$/, '');
}

export function compact<T extends object>(input: T): Partial<T> {
	return Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)) as Partial<T>;
}

export async function request<T>(
	fetchFn: typeof fetch,
	timeoutMs: number,
	url: string,
	init: RequestInit
): Promise<Reply<T>> {
	const headers: Record<string, string> = { accept: 'application/json' };
	if (init.key) headers.authorization = `Bearer ${init.key}`;
	if (init.body !== undefined) headers['content-type'] = 'application/json';

	const timeout = AbortSignal.timeout(timeoutMs);
	let status: number;
	let text: string;
	let retryAfter: string | null;
	try {
		const res = await fetchFn(url, {
			method: init.method,
			headers,
			body: init.body === undefined ? undefined : JSON.stringify(init.body),
			signal: init.signal ? AbortSignal.any([timeout, init.signal]) : timeout
		});
		status = res.status;
		retryAfter = res.headers.get('retry-after');
		text = await res.text();
	} catch {
		return { ok: false, warning: UNREACHABLE_WARNING };
	}

	if (status >= 500) return { ok: false, warning: UNREACHABLE_WARNING, status };

	let body: unknown;
	try {
		body = JSON.parse(text);
	} catch {
		body = undefined;
	}

	if (status >= 200 && status < 300) {
		if (body === undefined) return { ok: false, warning: UNREACHABLE_WARNING, status };
		return { ok: true, status, body: body as T };
	}

	const fields = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
	const error = typeof fields.error === 'string' ? fields.error : `HTTP ${status}`;
	const failure: Failure = { ok: false, warning: `beryl rejected the write: ${error}`, status };
	const seconds = Number(retryAfter);
	if (retryAfter !== null && retryAfter.trim() !== '' && Number.isFinite(seconds) && seconds >= 0) {
		failure.retryAfterMs = seconds * 1000;
	}
	return failure;
}
