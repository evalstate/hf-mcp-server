#!/usr/bin/env node

import { createServer } from './mcp-server.js';
import { WebServer } from './web-server.js';
import { DEFAULT_WEB_APP_PORT } from '../shared/constants.js';
import { parseArgs } from 'node:util';
import { logger } from './lib/logger.js';

// Parse command line arguments
const { values } = parseArgs({
	options: {
		port: { type: 'string', short: 'p' },
		json: { type: 'boolean', short: 'j' },
	},
	args: process.argv.slice(2),
});

logger.info('Starting Streamable HTTP server...');
if (values.json) {
	logger.info('JSON response mode enabled');
}

// Set development mode environment variable
process.env.NODE_ENV = process.env.NODE_ENV || 'production';

// Configuration with single port for both the web app and MCP API
const port = parseInt((values.port as string) || process.env.WEB_APP_PORT || DEFAULT_WEB_APP_PORT.toString());

async function start() {
	const useJsonMode = values.json || false;

	// Choose the appropriate transport type based on JSON mode
	const transportType = useJsonMode ? 'streamableHttpJson' : 'streamableHttp';

	// Create WebServer instance
	const webServer = new WebServer();

	const { server, cleanup } = await createServer(transportType, port, webServer);

	// Handle server shutdown
	process.on('SIGINT', () => {
		logger.info('Shutting down server...');
		// Use void to explicitly ignore the promise
		void (async () => {
			await cleanup();
			await server.close();
			logger.info('Server shutdown complete');
			process.exit(0);
		})();
	});
}

// Run the async start function
start().catch((error: unknown) => {
	logger.error({ error }, 'Server startup error');
	process.exit(1);
});
