import { StatefulTransport, type TransportOptions, type BaseSession } from './base-transport.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { logger } from '../lib/logger.js';

type StdioSession = BaseSession<StdioServerTransport>;

/**
 * Implementation of STDIO transport
 */
export class StdioTransport extends StatefulTransport<StdioSession> {
	private readonly SESSION_ID = 'STDIO';

	async initialize(_options: TransportOptions): Promise<void> {
		const transport = new StdioServerTransport();
		
		// Create server instance using factory (null headers for STDIO)
		const server = await this.serverFactory(null);

		// Create session with metadata tracking
		const session: StdioSession = {
			transport,
			server,
			metadata: {
				id: this.SESSION_ID,
				connectedAt: new Date(),
				lastActivity: new Date(),
				capabilities: {},
			},
		};

		// Store session in map
		this.sessions.set(this.SESSION_ID, session);

		try {
			// Set up oninitialized callback to capture client info using base class helper
			server.server.oninitialized = this.createClientInfoCapture(this.SESSION_ID);

			await server.connect(transport);
			logger.info('STDIO transport initialized');
		} catch (error) {
			logger.error({ error }, 'Error connecting STDIO transport');
			// Clean up on error
			this.sessions.delete(this.SESSION_ID);
			throw error;
		}
	}

	/**
	 * STDIO doesn't need stale session removal since there's only one persistent session
	 */
	protected removeStaleSession(sessionId: string): Promise<void> {
		// STDIO has only one session and it's not subject to staleness
		logger.debug({ sessionId }, 'STDIO session staleness check (no-op)');
		return Promise.resolve();
	}

	async cleanup(): Promise<void> {
		const session = this.sessions.get(this.SESSION_ID);
		if (session) {
			try {
				await session.transport.close();
			} catch (error) {
				logger.error({ error }, 'Error closing STDIO transport');
			}
			try {
				await session.server.close();
			} catch (error) {
				logger.error({ error }, 'Error closing STDIO server');
			}
		}
		this.sessions.clear();
		logger.info('STDIO transport cleaned up');
		return Promise.resolve();
	}

	/**
	 * Get the STDIO session if it exists
	 */
	getSession(): StdioSession | undefined {
		return this.sessions.get(this.SESSION_ID);
	}
}
