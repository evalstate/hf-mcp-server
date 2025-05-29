import { BaseTransport, type TransportOptions } from './base-transport.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

/**
 * Implementation of STDIO transport
 */
export class StdioTransport extends BaseTransport {
	private transport: StdioServerTransport | null = null;

	async initialize(_options: TransportOptions): Promise<void> {
		this.transport = new StdioServerTransport();

		try {
			await this.server.connect(this.transport);
			console.error('STDIO transport initialized');
		} catch (error) {
			console.error('Error connecting STDIO transport:', error);
			throw error;
		}
	}

	async cleanup(): Promise<void> {
		// STDIO doesn't require special cleanup
		console.error('Cleaning up STDIO transport');
	}
}
