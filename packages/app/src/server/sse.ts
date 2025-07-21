#!/usr/bin/env node

import { Application } from './application.js';
import { WebServer } from './web-server.js';
import { DEFAULT_WEB_APP_PORT } from '../shared/constants.js';
import { parseArgs } from 'node:util';
import { logger } from './utils/logger.js';

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

	// Create Application instance
	const app = new Application({
		transportType: 'sse',
		webAppPort: port,
		webServerInstance: webServer,
	});

	// Start the application
	await app.start();

	// Handle server shutdown
	const shutdown = async () => {
		logger.info('Shutting down server...');
		try {
			await app.stop();
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
