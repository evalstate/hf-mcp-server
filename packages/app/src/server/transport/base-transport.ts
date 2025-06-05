import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Express } from 'express';
import { logger } from '../lib/logger.js';
import type { TransportMetrics } from '../../shared/transport-metrics.js';
import { createEmptyMetrics, getClientKey } from '../../shared/transport-metrics.js';

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
	protected metrics: TransportMetrics;

	constructor(serverFactory: ServerFactory, app: Express) {
		this.serverFactory = serverFactory;
		this.app = app;
		this.metrics = createEmptyMetrics();
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

	/**
	 * Get current transport metrics
	 */
	getMetrics(): TransportMetrics {
		return this.metrics;
	}

	/**
	 * Get configuration settings (only relevant for stateful transports)
	 */
	getConfiguration(): { staleCheckInterval?: number; staleTimeout?: number } {
		return {};
	}

	/**
	 * Track a new request received by the transport
	 */
	protected trackRequest(): void {
		this.metrics.requests.total++;
		this.updateRequestsPerMinute();
	}

	/**
	 * Track an error in the transport
	 */
	protected trackError(statusCode?: number, error?: Error): void {
		if (statusCode && statusCode >= 400 && statusCode < 500) {
			this.metrics.errors.expected++;
		} else {
			this.metrics.errors.unexpected++;
		}

		if (error) {
			this.metrics.errors.lastError = {
				type: error.constructor.name,
				message: error.message,
				timestamp: new Date(),
			};
		}
	}

	/**
	 * Track a new connection established (global counter)
	 */
	protected trackNewConnection(): void {
		this.metrics.connections.total++;
	}

	/**
	 * Associate a session with a client identity when client info becomes available
	 */
	protected associateSessionWithClient(clientInfo: { name: string; version: string }): void {
		const clientKey = getClientKey(clientInfo.name, clientInfo.version);
		let clientMetrics = this.metrics.clients.get(clientKey);

		if (!clientMetrics) {
			clientMetrics = {
				name: clientInfo.name,
				version: clientInfo.version,
				requestCount: 0,
				firstSeen: new Date(),
				lastSeen: new Date(),
				isConnected: true,
				activeConnections: 1,
				totalConnections: 1,
			};
			this.metrics.clients.set(clientKey, clientMetrics);
		} else {
			clientMetrics.lastSeen = new Date();
			clientMetrics.isConnected = true;
			clientMetrics.activeConnections++;
			clientMetrics.totalConnections++;
		}
	}

	/**
	 * Update client activity when a request is made
	 */
	protected updateClientActivity(clientInfo?: { name: string; version: string }): void {
		if (!clientInfo) return;

		const clientKey = getClientKey(clientInfo.name, clientInfo.version);
		const clientMetrics = this.metrics.clients.get(clientKey);

		if (clientMetrics) {
			clientMetrics.requestCount++;
			clientMetrics.lastSeen = new Date();
		}
	}

	/**
	 * Mark a client connection as disconnected
	 */
	protected disconnectClient(clientInfo?: { name: string; version: string }): void {
		if (!clientInfo) return;

		const clientKey = getClientKey(clientInfo.name, clientInfo.version);
		const clientMetrics = this.metrics.clients.get(clientKey);

		if (clientMetrics && clientMetrics.activeConnections > 0) {
			clientMetrics.activeConnections--;
			if (clientMetrics.activeConnections === 0) {
				clientMetrics.isConnected = false;
			}
		}
	}

	/**
	 * Update requests per minute calculation
	 */
	private updateRequestsPerMinute(): void {
		const now = Date.now();
		const startupTime = this.metrics.startupTime.getTime();
		const uptimeMinutes = (now - startupTime) / (1000 * 60);

		this.metrics.requests.averagePerMinute =
			uptimeMinutes > 0 ? Math.round((this.metrics.requests.total / uptimeMinutes) * 100) / 100 : 0;
	}
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
	protected readonly STALE_CHECK_INTERVAL = parseInt(process.env.MCP_CLIENT_CONNECTION_CHECK || '90000', 10);
	protected readonly STALE_TIMEOUT = parseInt(process.env.MCP_CLIENT_CONNECTION_TIMEOUT || '300000', 10);

	/**
	 * Update the last activity timestamp for a session
	 */
	protected updateSessionActivity(sessionId: string): void {
		const session = this.sessions.get(sessionId);
		if (session) {
			session.metadata.lastActivity = new Date();
			// Update client activity metrics if client info is available
			this.updateClientActivity(session.metadata.clientInfo);
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
					// Associate session with client for metrics tracking
					this.associateSessionWithClient(clientInfo);
				}

				if (clientCapabilities) {
					session.metadata.capabilities = {
						sampling: !!clientCapabilities.sampling,
						roots: !!clientCapabilities.roots,
					};
				}

				logger.debug(
					{
						sessionId,
						clientInfo: session.metadata.clientInfo,
						capabilities: session.metadata.capabilities,
					},
					'Client Initialization Request'
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
		// Update metrics active connection count
		this.metrics.connections.active = this.sessions.size;
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

	/**
	 * Track a new session created (called when session is added to sessions map)
	 */
	protected trackSessionCreated(): void {
		this.trackNewConnection();
		this.metrics.connections.active = this.sessions.size;
	}

	/**
	 * Track a session that was cleaned up/removed
	 */
	protected trackSessionCleaned(session?: TSession): void {
		if (!this.metrics.connections.cleaned) {
			this.metrics.connections.cleaned = 0;
		}
		this.metrics.connections.cleaned++;
		this.metrics.connections.active = this.sessions.size;

		// Disconnect client if we have client info
		if (session?.metadata.clientInfo) {
			this.disconnectClient(session.metadata.clientInfo);
		}
	}

	/**
	 * Get configuration settings for stateful transports
	 */
	override getConfiguration(): { staleCheckInterval: number; staleTimeout: number } {
		return {
			staleCheckInterval: this.STALE_CHECK_INTERVAL,
			staleTimeout: this.STALE_TIMEOUT,
		};
	}
}
