const UNIQUE_VIOLATION = '23505';

// drizzle wraps the driver error in `cause`; the SQLSTATE sits on whichever link carries `code`.
export function isUniqueViolation(error: unknown): boolean {
	for (let e = error as { code?: unknown; cause?: unknown } | undefined; e;) {
		if (e.code === UNIQUE_VIOLATION) return true;
		e = e.cause as typeof e;
	}
	return false;
}
