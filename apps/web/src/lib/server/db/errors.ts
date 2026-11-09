const UNIQUE_VIOLATION = '23505';
const NUL_IN_TEXT = '22021';

// Check `code` on every link of the `cause` chain.
function hasSqlState(error: unknown, state: string): boolean {
	for (let e = error as { code?: unknown; cause?: unknown } | undefined; e;) {
		if (e.code === state) return true;
		e = e.cause as typeof e;
	}
	return false;
}

export const isUniqueViolation = (error: unknown) => hasSqlState(error, UNIQUE_VIOLATION);
export const isNulInText = (error: unknown) => hasSqlState(error, NUL_IN_TEXT);

// A unique violation raised by the named index or constraint.
export function isUniqueViolationOn(error: unknown, constraint: string): boolean {
	for (let e = error as { code?: unknown; constraint?: unknown; cause?: unknown } | undefined; e;) {
		if (e.code === UNIQUE_VIOLATION && e.constraint === constraint) return true;
		e = e.cause as typeof e;
	}
	return false;
}
