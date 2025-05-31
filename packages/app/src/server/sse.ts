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
	},
	args: process.argv.slice(2),
});

logger.info('Starting SSE server...');

process.env.NODE_ENV = process.env.NODE_ENV || 'production';

const port = parseInt((values.port as string) || process.env.WEB_APP_PORT || DEFAULT_WEB_APP_PORT.toString());

async function start() {
	// Create WebServer instance
	const webServer = new WebServer();

	const { server, cleanup } = await createServer('sse', port, webServer);

	// Handle server shutdown
	const shutdown = async () => {
		logger.info('Shutting down server...');
		try {
			await cleanup();
			await server.close();
			logger.info('Server shutdown complete');
			process.exit(0);
		} catch (error) {
			logger.error({ error }, 'Error during shutdown');
			process.exit(1);
		}
	};

	process.once('SIGINT', () => {
		void shutdown();
	});

	process.once('SIGTERM', () => {
		void shutdown();
	});
}

// Run the async start function
start().catch((error: unknown) => {
	logger.error({ error }, 'Server startup error');
	process.exit(1);
});
