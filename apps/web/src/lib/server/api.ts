export class ApiError extends Error {
	readonly status: number;
	readonly body: Record<string, unknown>;

	constructor(status: number, error: string, extra: Record<string, unknown> = {}) {
		super(error);
		this.status = status;
		this.body = { error, ...extra };
	}
}

// Client errors are returned, never thrown, so handlers stay callable with a bare event object.
export function route<E>(
	handler: (event: E) => Promise<Response>
): (event: E) => Promise<Response> {
	return async (event) => {
		try {
			return await handler(event);
		} catch (error) {
			if (error instanceof ApiError) return Response.json(error.body, { status: error.status });
			throw error;
		}
	};
}

export function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseId(value: string | undefined, what: string): string {
	if (value === undefined || !UUID_V4.test(value)) throw new ApiError(400, `malformed ${what} id`);
	return value.toLowerCase();
}

export const BODY_MAX = 8 << 20;

// Counts bytes as they arrive, so a chunked body without Content-Length stops at the cap
// whatever BODY_SIZE_LIMIT is set to.
export async function readCapped(request: Request, max: number): Promise<string> {
	if (!request.body) return '';
	const reader = request.body.getReader();
	const parts: Uint8Array[] = [];
	let total = 0;
	for (;;) {
		const { value, done } = await reader.read();
		if (done) break;
		total += value.length;
		if (total > max) {
			await reader.cancel().catch(() => {});
			throw new ApiError(413, 'request body too large');
		}
		parts.push(value);
	}
	return Buffer.concat(parts).toString('utf8');
}

export async function readBody(request: Request): Promise<Record<string, unknown>> {
	const text = await readCapped(request, BODY_MAX);
	if (text.trim() === '') return {};
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		throw new ApiError(400, 'malformed JSON body');
	}
	if (!isObject(parsed)) throw new ApiError(400, 'body must be a JSON object');
	return parsed;
}
