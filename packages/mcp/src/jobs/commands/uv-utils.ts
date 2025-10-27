import type { UvArgs } from '../types.js';

export const UV_DEFAULT_IMAGE = 'ghcr.io/astral-sh/uv:python3.12-bookworm';

type UvCommandOptions = Pick<UvArgs, 'with_deps' | 'python' | 'script_args'>;

export function buildUvCommand(script: string, args: UvCommandOptions): string {
	const parts: string[] = ['uv', 'run'];

	if (args.with_deps && args.with_deps.length > 0) {
		for (const dep of args.with_deps) {
			parts.push('--with', dep);
		}
	}

	if (args.python) {
		parts.push('-p', args.python);
	}

	parts.push(script);

	if (args.script_args && args.script_args.length > 0) {
		parts.push(...args.script_args);
	}

	return parts.join(' ');
}

export function wrapInlineScript(script: string, args: UvCommandOptions): string {
	const encoded = Buffer.from(script).toString('base64');
	const baseCommand = buildUvCommand('-', args);
	return `echo "${encoded}" | base64 -d | ${baseCommand}`;
}
