import { BaseTransport, type TransportOptions } from './base-transport.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { logger } from '../lib/logger.js';

/**
 * Implementation of STDIO transport
 */
export class StdioTransport extends BaseTransport {
	private transport: StdioServerTransport | null = null;

	async initialize(_options: TransportOptions): Promise<void> {
		this.transport = new StdioServerTransport();

		try {
			await this.server.connect(this.transport);
			logger.info('STDIO transport initialized');
		} catch (error) {
			logger.error({ error }, 'Error connecting STDIO transport');
			throw error;
		}
	}

	async cleanup(): Promise<void> {
		// STDIO doesn't require special cleanup
		logger.info('Cleaning up STDIO transport');
		return Promise.resolve();
	}
}
