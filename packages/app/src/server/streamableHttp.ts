#!/usr/bin/env node

import { createServer } from './mcp-server.js';
import { DEFAULT_WEB_APP_PORT } from '../shared/constants.js';
import { parseArgs } from 'node:util';

// Parse command line arguments
const { values } = parseArgs({
	options: {
		port: { type: 'string', short: 'p' },
		json: { type: 'boolean', short: 'j' },
	},
	args: process.argv.slice(2),
});

console.error('Starting Streamable HTTP server...');
if (values.json) {
	console.error('JSON response mode enabled');
}

// Set development mode environment variable
process.env.NODE_ENV = process.env.NODE_ENV || 'production';

// Configuration with single port for both the web app and MCP API
const port = parseInt((values.port as string) || process.env.WEB_APP_PORT || DEFAULT_WEB_APP_PORT.toString());

async function start() {
	const useJsonMode = values.json || false;

	// Choose the appropriate transport type based on JSON mode
	const transportType = useJsonMode ? 'streamableHttpJson' : 'streamableHttp';

	const { server, cleanup } = await createServer(transportType, port);

	// Handle server shutdown
	process.on('SIGINT', () => {
		console.log('Shutting down server...');
		// Use void to explicitly ignore the promise
		void (async () => {
			await cleanup();
			await server.close();
			console.log('Server shutdown complete');
			process.exit(0);
		})();
	});
}

// Run the async start function
start().catch((error: unknown) => {
	console.error('Server startup error:', error);
	process.exit(1);
});
