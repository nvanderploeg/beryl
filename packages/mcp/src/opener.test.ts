import { afterEach, describe, expect, it, vi } from 'vitest';

const spawn = vi.hoisted(() => vi.fn());
vi.mock('node:child_process', () => ({ spawn }));

const { openInBrowser } = await import('./server.ts');

afterEach(() => {
	spawn.mockReset();
	vi.unstubAllEnvs();
});

describe('openInBrowser', () => {
	it('spawns the platform opener detached with its output discarded', () => {
		const child = { on: vi.fn(), unref: vi.fn() };
		spawn.mockReturnValue(child);

		openInBrowser('http://h/t/1#nk=pn_1');

		expect(spawn).toHaveBeenCalledOnce();
		const [cmd, args, options] = spawn.mock.calls[0];
		const expected =
			process.platform === 'darwin'
				? ['open', ['http://h/t/1#nk=pn_1']]
				: process.platform === 'win32'
					? ['cmd', ['/c', 'start', '', 'http://h/t/1#nk=pn_1']]
					: ['xdg-open', ['http://h/t/1#nk=pn_1']];
		expect([cmd, args]).toEqual(expected);
		expect(options).toEqual({ detached: true, stdio: 'ignore' });
		expect(child.on).toHaveBeenCalledWith('error', expect.any(Function));
		expect(child.unref).toHaveBeenCalled();
	});

	it('does nothing when PALANTIR_OPEN=0', () => {
		vi.stubEnv('PALANTIR_OPEN', '0');

		openInBrowser('http://h');

		expect(spawn).not.toHaveBeenCalled();
	});

	it('swallows a spawn that throws', () => {
		spawn.mockImplementation(() => {
			throw new Error('ENOENT');
		});

		expect(() => openInBrowser('http://h')).not.toThrow();
	});
});
