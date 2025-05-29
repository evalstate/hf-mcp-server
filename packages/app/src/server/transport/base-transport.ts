import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Express } from 'express';

export interface TransportOptions {
	port?: number;
}

/**
 * Base class for all transport implementations
 */
export abstract class BaseTransport {
	protected server: McpServer;
	protected app: Express;

	constructor(server: McpServer, app: Express) {
		this.server = server;
		this.app = app;
	}

	/**
	 * Initialize the transport with the given options
	 */
	abstract initialize(options: TransportOptions): Promise<void>;

	/**
	 * Clean up the transport resources
	 */
	abstract cleanup(): Promise<void>;
}
