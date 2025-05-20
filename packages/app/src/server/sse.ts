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

console.error('Starting SSE server...');

process.env.NODE_ENV = process.env.NODE_ENV || 'production';

const port = parseInt((values.port as string) || process.env.WEB_APP_PORT || DEFAULT_WEB_APP_PORT.toString());

async function start() {
	const { server, cleanup } = await createServer('sse', port);

	// Handle server shutdown
	process.on('SIGINT', async () => {
		console.log('Shutting down server...');
		await cleanup();
		await server.close();
		console.log('Server shutdown complete');
		process.exit(0);
	});
}

// Run the async start function
start().catch((error) => {
	console.error('Server startup error:', error);
	process.exit(1);
});
