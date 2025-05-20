#!/usr/bin/env node

import { createServer } from './mcp-server.js';
import { DEFAULT_WEB_APP_PORT } from '../shared/constants.js';
import { parseArgs } from 'node:util';

// Parse command line arguments
const { values } = parseArgs({
	options: {
		port: { type: 'string', short: 'p' },
	},
	args: process.argv.slice(2),
});

console.error('Starting default (STDIO) server...');

process.env.NODE_ENV = process.env.NODE_ENV || 'production';

const port = parseInt((values.port as string) || process.env.WEB_APP_PORT || DEFAULT_WEB_APP_PORT.toString());

async function main() {
	const { server, cleanup } = await createServer('stdio', port);

	// Cleanup on exit
	process.on('SIGINT', async () => {
		await cleanup();
		await server.close();
		process.exit(0);
	});
}

main().catch((error) => {
	console.error('Server error:', error);
	process.exit(1);
});
