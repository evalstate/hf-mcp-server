import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type Express } from 'express';
import { type TransportType } from '../../shared/constants.js';
import type { BaseTransport } from './base-transport.js';
import { StdioTransport } from './stdio-transport.js';
import { SseTransport } from './sse-transport.js';
import { StreamableHttpTransport } from './streamable-http-transport.js';
import { StatelessHttpTransport } from './stateless-http-transport.js';

/**
 * Utility for creating transport instances
 */
export const createTransport = (type: TransportType, server: McpServer, app: Express): BaseTransport => {
	switch (type) {
		case 'stdio':
			return new StdioTransport(server, app);
		case 'sse':
			return new SseTransport(server, app);
		case 'streamableHttp':
			return new StreamableHttpTransport(server, app, false);
		case 'streamableHttpJson':
			return new StatelessHttpTransport(server, app);
		default:
			throw new Error(`Unsupported transport type: ${type}`);
	}
};
