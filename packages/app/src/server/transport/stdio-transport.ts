import { BaseTransport, type TransportOptions, type BaseSession, type SessionMetadata } from './base-transport.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { logger } from '../lib/logger.js';

type StdioSession = BaseSession<StdioServerTransport>;

/**
 * Implementation of STDIO transport
 */
export class StdioTransport extends BaseTransport {
	// Store STDIO session using Map like other transports (even though there's only one)
	private sessions: Map<string, StdioSession> = new Map();
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
			// Set up oninitialized callback to capture client info
			server.server.oninitialized = () => {
				const stdioSession = this.sessions.get(this.SESSION_ID);
				if (stdioSession) {
					const clientInfo = server.server.getClientVersion();
					const clientCapabilities = server.server.getClientCapabilities();
					
					if (clientInfo) {
						stdioSession.metadata.clientInfo = clientInfo;
					}
					
					if (clientCapabilities) {
						stdioSession.metadata.capabilities = {
							sampling: !!clientCapabilities.sampling,
							roots: !!clientCapabilities.roots,
						};
					}
					
					logger.info(
						{
							sessionId: this.SESSION_ID,
							clientInfo: stdioSession.metadata.clientInfo,
							capabilities: stdioSession.metadata.capabilities,
						},
						'STDIO client info captured'
					);
				}
			};

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
	 * Mark transport as shutting down
	 */
	override shutdown(): void {
		// STDIO doesn't need to reject new connections
		logger.debug('STDIO transport shutdown signaled');
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
	 * Get the number of active connections
	 */
	override getActiveConnectionCount(): number {
		return this.sessions.size;
	}

	/**
	 * Get the STDIO session if it exists
	 */
	getSession(): StdioSession | undefined {
		return this.sessions.get(this.SESSION_ID);
	}

	/**
	 * Get all active sessions with their metadata
	 */
	override getSessions(): SessionMetadata[] {
		const sessions: SessionMetadata[] = [];
		for (const session of this.sessions.values()) {
			sessions.push({ ...session.metadata });
		}
		return sessions;
	}
}
