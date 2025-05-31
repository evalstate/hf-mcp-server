import { BaseTransport, type TransportOptions } from './base-transport.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { logger } from '../lib/logger.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/**
 * Implementation of STDIO transport
 */
export class StdioTransport extends BaseTransport {
	private transport: StdioServerTransport | null = null;
	private server: McpServer | null = null;

	async initialize(_options: TransportOptions): Promise<void> {
		this.transport = new StdioServerTransport();
		
		// Create server instance using factory (null headers for STDIO)
		this.server = this.serverFactory(null);

		try {
			await this.server.connect(this.transport);
			logger.info('STDIO transport initialized');
		} catch (error) {
			logger.error({ error }, 'Error connecting STDIO transport');
			throw error;
		}
	}

	/**
	 * Mark transport as shutting down
	 */
	override shutdown(): void {
		// STDIO doesn't need to reject new connections
		logger.debug('STDIO transport shutdown signaled');
	}

	async cleanup(): Promise<void> {
		// STDIO doesn't require special cleanup
		logger.info('Cleaning up STDIO transport');
		return Promise.resolve();
	}
}
