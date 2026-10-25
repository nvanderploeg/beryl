#!/usr/bin/env node
import { join } from 'node:path';
import { createClient, defaultConfigDir } from '@speculum/client';

const argv = process.argv.slice(2);
const configDir = defaultConfigDir(process.env);
const waitsDir = join(configDir, 'waits');

// Exit only after both streams drain: on macOS a pipe is asynchronous and would lose the tail.
function exitAfterFlush(code: number): void {
	process.stdout.write('', () => process.stderr.write('', () => process.exit(code)));
}

const print = (stream: NodeJS.WriteStream) => (s: string) => {
	stream.write(s + '\n');
};

if (argv[0] === 'hook') {
	const { handleHook, sessionsDir, HOOK_TIMEOUT_MS } = await import('./hook.ts');
	const { isListening } = await import('./wait.ts');
	let raw = '';
	for await (const chunk of process.stdin) raw += chunk;
	const out = await handleHook(raw, {
		dir: sessionsDir(configDir),
		client: createClient({ requestTimeoutMs: HOOK_TIMEOUT_MS }),
		isListening: (topicId) => isListening(waitsDir, topicId)
	});
	if (out) process.stdout.write(out + '\n');
	exitAfterFlush(0);
} else if (argv[0] === 'wait') {
	const { waitCommand } = await import('./wait.ts');
	const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const;
	const code = await waitCommand(argv.slice(1), {
		client: createClient(),
		dir: waitsDir,
		pid: process.pid,
		stdout: print(process.stdout),
		stderr: print(process.stderr),
		onStop: (stop) => {
			for (const signal of signals) process.on(signal, stop);
			return () => {
				for (const signal of signals) process.off(signal, stop);
			};
		}
	});
	exitAfterFlush(code);
} else {
	const { run } = await import('./run.ts');
	process.exitCode = await run(argv, {
		stdout: print(process.stdout),
		stderr: print(process.stderr)
	});
}
