import { BaseTransport, type TransportOptions, type BaseSession } from './base-transport.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { logger } from '../lib/logger.js';

type StdioSession = BaseSession<StdioServerTransport>;

/**
 * Implementation of STDIO transport
 */
export class StdioTransport extends BaseTransport {
	private session: StdioSession | null = null;

	async initialize(_options: TransportOptions): Promise<void> {
		const transport = new StdioServerTransport();
		
		// Create server instance using factory (null headers for STDIO)
		const server = this.serverFactory(null);

		// Create session with metadata tracking
		this.session = {
			transport,
			server,
			metadata: {
				id: 'stdio-session',
				connectedAt: new Date(),
				lastActivity: new Date(),
				capabilities: {},
			},
		};

		try {
			await server.connect(transport);
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
		this.session = null;
		logger.info('Cleaning up STDIO transport');
		return Promise.resolve();
	}


	/**
	 * Get the number of active connections
	 */
	override getActiveConnectionCount(): number {
		return this.session ? 1 : 0;
	}
}
