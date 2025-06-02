import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Express } from 'express';
import { logger } from '../lib/logger.js';

/**
 * Factory function to create server instances
 * This should be provided during transport construction to enable per-connection server instances
 */
export type ServerFactory = (headers: Record<string, string> | null) => Promise<McpServer>;

export interface TransportOptions {
	port?: number;
	onClientInfoUpdate?: (clientInfo: { name: string; version: string }) => void;
}

/**
 * Standardized session metadata structure for all transports
 */
export interface SessionMetadata {
	id: string;
	connectedAt: Date;
	lastActivity: Date;
	clientInfo?: {
		name: string;
		version: string;
	};
	capabilities: {
		sampling?: boolean;
		roots?: boolean;
	};
}

/**
 * Base session interface that all transport sessions should extend
 * This provides common fields while allowing transport-specific extensions
 */
export interface BaseSession<T = unknown> {
	transport: T;
	server: McpServer;
	metadata: SessionMetadata;
}

/**
 * Special constant for stateless transports to distinguish from zero active connections
 */
export const STATELESS_MODE = -1;

/**
 * Base class for all transport implementations
 */
export abstract class BaseTransport {
	protected serverFactory: ServerFactory;
	protected app: Express;

	constructor(serverFactory: ServerFactory, app: Express) {
		this.serverFactory = serverFactory;
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

	/**
	 * Mark transport as shutting down
	 * Optional method for transports that need to reject new connections
	 */
	shutdown?(): void;

	/**
	 * Get the number of active connections
	 * Returns -1 (STATELESS_MODE) for stateless transports
	 */
	abstract getActiveConnectionCount(): number;

	/**
	 * Get all active sessions with their metadata
	 * Returns an array of session metadata for connection dashboard
	 */
	abstract getSessions(): SessionMetadata[];
}

/**
 * Base class for stateful transport implementations that maintain session state
 * Provides common functionality for session management, stale connection detection, and client info tracking
 */
export abstract class StatefulTransport<TSession extends BaseSession = BaseSession> extends BaseTransport {
	protected sessions: Map<string, TSession> = new Map();
	protected isShuttingDown = false;
	protected staleCheckInterval?: NodeJS.Timeout;

	// Configuration from environment variables
	protected readonly STALE_CHECK_INTERVAL = parseInt(process.env.MCP_CLIENT_CONNECTION_CHECK || '30000', 10);
	protected readonly STALE_TIMEOUT = parseInt(process.env.MCP_CLIENT_CONNECTION_TIMEOUT || '60000', 10);

	/**
	 * Update the last activity timestamp for a session
	 */
	protected updateSessionActivity(sessionId: string): void {
		const session = this.sessions.get(sessionId);
		if (session) {
			session.metadata.lastActivity = new Date();
		}
	}

	/**
	 * Create a standardized client info capture callback for a session
	 */
	protected createClientInfoCapture(sessionId: string): () => void {
		return () => {
			const session = this.sessions.get(sessionId);
			if (session) {
				const clientInfo = session.server.server.getClientVersion();
				const clientCapabilities = session.server.server.getClientCapabilities();
				
				if (clientInfo) {
					session.metadata.clientInfo = clientInfo;
				}
				
				if (clientCapabilities) {
					session.metadata.capabilities = {
						sampling: !!clientCapabilities.sampling,
						roots: !!clientCapabilities.roots,
					};
				}
				
				logger.info(
					{
						sessionId,
						clientInfo: session.metadata.clientInfo,
						capabilities: session.metadata.capabilities,
					},
					'Client info captured'
				);
			}
		};
	}

	/**
	 * Start the stale connection check interval
	 */
	protected startStaleConnectionCheck(): void {
		this.staleCheckInterval = setInterval(() => {
			if (this.isShuttingDown) return;

			const now = Date.now();
			const staleSessionIds: string[] = [];

			// Find stale sessions
			for (const [sessionId, session] of this.sessions) {
				const timeSinceActivity = now - session.metadata.lastActivity.getTime();
				if (timeSinceActivity > this.STALE_TIMEOUT) {
					staleSessionIds.push(sessionId);
				}
			}

			// Remove stale sessions
			for (const sessionId of staleSessionIds) {
				const session = this.sessions.get(sessionId);
				if (session) {
					logger.info(
						{ sessionId, timeSinceActivity: now - session.metadata.lastActivity.getTime() },
						'Removing stale session'
					);
					void this.removeStaleSession(sessionId);
				}
			}
		}, this.STALE_CHECK_INTERVAL);
	}

	/**
	 * Remove a stale session - must be implemented by concrete transport
	 */
	protected abstract removeStaleSession(sessionId: string): Promise<void>;

	/**
	 * Mark transport as shutting down
	 */
	override shutdown(): void {
		this.isShuttingDown = true;
	}

	/**
	 * Get the number of active connections
	 */
	override getActiveConnectionCount(): number {
		return this.sessions.size;
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

	/**
	 * Check if server is accepting new connections
	 */
	isAcceptingConnections(): boolean {
		return !this.isShuttingDown;
	}

	/**
	 * Stop the stale connection check interval during cleanup
	 */
	protected stopStaleConnectionCheck(): void {
		if (this.staleCheckInterval) {
			clearInterval(this.staleCheckInterval);
			this.staleCheckInterval = undefined;
		}
	}
}
