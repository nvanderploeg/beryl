import { parseArgs } from 'node:util';

export const USAGE = `usage:
  speculum open <title> [--destination d] [--summary s] [--project name] [--repo owner/name] [--branch b]
                [--tool t] [--model m] [--effort e] [--file nodes.json] [--cwd dir]
  speculum open --topic <id>
  speculum get <topicId> [--path p] [--full] [--json]
  speculum put <topicId> [--file nodes.json]          nodes from the file, else stdin
  speculum rm <topicId> <path>...
  speculum mv <topicId> <from> <to>
  speculum topic <topicId> [--title t] [--destination d] [--summary s] [--status open|closed]
                 [--current path | --no-current]
  speculum pull <topicId>
  speculum resolve <topicId> <noteId> [--reply text] [--changed path]...
  speculum wait <topicId> [--timeout 12h]             durations: 90s, 30m, 12h, or 0 for no limit
  speculum note <topicId> <intent> [text] [--path p] [--widget w] [--element e] [--author a]
  speculum send <topicId>
  speculum url <topicId> [--private]
  speculum doctor [--cwd dir]
  speculum hook`;

export class UsageError extends Error {}

export function parse<const O extends NonNullable<Parameters<typeof parseArgs>[0]>['options']>(
	args: string[],
	options: O,
	positionals: [min: number, max: number]
) {
	let parsed;
	try {
		parsed = parseArgs({ args, options, allowPositionals: true, strict: true });
	} catch (error) {
		throw new UsageError(error instanceof Error ? error.message : String(error));
	}
	const count = parsed.positionals.length;
	if (count < positionals[0] || count > positionals[1]) {
		throw new UsageError('wrong number of arguments');
	}
	return parsed as {
		values: {
			[K in keyof O]?: O[K] extends { type: 'boolean' }
				? boolean
				: O[K] extends { multiple: true }
					? string[]
					: string;
		};
		positionals: string[];
	};
}

const UNITS: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000 };

export function parseDuration(value: string): number {
	if (value === '0') return 0;
	const match = /^(\d+)([smh])$/.exec(value);
	if (!match) throw new UsageError(`bad duration: ${value} (use 90s, 30m, 12h or 0)`);
	return Number(match[1]) * UNITS[match[2]];
}

export function formatDuration(ms: number): string {
	if (ms % UNITS.h === 0) return `${ms / UNITS.h}h`;
	if (ms % UNITS.m === 0) return `${ms / UNITS.m}m`;
	return `${Math.ceil(ms / UNITS.s)}s`;
}
