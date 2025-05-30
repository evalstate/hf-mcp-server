import { BaseTransport, type TransportOptions } from './base-transport.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { logger } from '../lib/logger.js';
import type { Request, Response, Express } from 'express';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { JsonRpcErrors } from './json-rpc-errors.js';

interface SSEConnection {
	transport: SSEServerTransport;
	cleanup: () => Promise<void>;
	heartbeatInterval?: NodeJS.Timeout;
	createdAt: Date;
	lastActivity: Date;
}

/**
 * Safely extract JSON-RPC ID from request body
 */
function extractJsonRpcId(body: unknown): string | number | null {
	if (body && typeof body === 'object' && 'id' in body) {
		const id = (body as { id: unknown }).id;
		if (typeof id === 'string') {
			return id;
		}
		if (typeof id === 'number') {
			return id;
		}
		if (id === null) {
			return null;
		}
	}
	return null;
}

export class SseTransport extends BaseTransport {
	// Store SSE connections with comprehensive metadata
	private sseConnections: Map<string, SSEConnection> = new Map();
	private isShuttingDown = false;

	constructor(server: McpServer, app: Express) {
		super(server, app);
		this.setupGracefulShutdown();
	}

	async initialize(_options: TransportOptions): Promise<void> {
		// SSE endpoint for client connections
		this.app.get('/sse', (req: Request, res: Response) => {
			void this.handleSseConnection(req, res);
		});

		// Handle messages for all SSE sessions
		this.app.post('/message', (req: Request, res: Response) => {
			void this.handleSseMessage(req, res);
		});

		logger.info('SSE transport routes initialized');
		return Promise.resolve();
	}

	private async handleSseConnection(req: Request, res: Response): Promise<void> {
		try {
			// Reject new connections during shutdown
			if (this.isShuttingDown) {
				logger.warn('Rejecting SSE connection during shutdown');
				res.status(503).json(JsonRpcErrors.serverShuttingDown());
				return;
			}

			const existingSessionId = req.query.sessionId as string | undefined;

			// Handle reconnection attempts
			if (existingSessionId) {
				const existing = this.sseConnections.get(existingSessionId);
				if (existing) {
					logger.warn(
						{
							sessionId: existingSessionId,
							age: Date.now() - existing.createdAt.getTime(),
						},
						'Client attempting to reconnect with existing sessionId'
					);

					// Clean up old connection before creating new one
					await this.closeConnection(existingSessionId);
				}
			}

			// Create new transport
			const transport = new SSEServerTransport('/message', res);
			const sessionId = transport.sessionId;

			logger.info({ sessionId }, 'New SSE connection established');

			// Create comprehensive cleanup function
			const cleanup = this.createCleanupFunction(sessionId);

			// Set up heartbeat to detect stale connections
			const heartbeatInterval = setInterval(() => {
				if (res.destroyed || res.writableEnded) {
					logger.debug({ sessionId }, 'Detected stale SSE connection');
					void cleanup();
				}
			}, 30000); // Check every 30 seconds

			// Store connection with metadata
			const connection: SSEConnection = {
				transport,
				cleanup,
				heartbeatInterval,
				createdAt: new Date(),
				lastActivity: new Date(),
			};

			this.sseConnections.set(sessionId, connection);

			// Set up connection event handlers
			res.on('close', () => {
				logger.info({ sessionId }, 'SSE connection closed by client');
				void cleanup();
			});

			res.on('error', (error) => {
				logger.error({ error, sessionId }, 'SSE connection error');
				void cleanup();
			});

			// Connect to server with proper cleanup handling
			await this.connectWithCleanup(transport, sessionId, cleanup);

			logger.debug({ sessionId }, 'SSE transport fully initialized');
		} catch (error) {
			logger.error({ error }, 'Error establishing SSE connection');

			if (!res.headersSent) {
				res.status(500).json(JsonRpcErrors.internalError(null, 'Internal server error establishing SSE connection'));
			}
		}
	}

	private async handleSseMessage(req: Request, res: Response): Promise<void> {
		try {
			const sessionId = req.query.sessionId as string;

			if (!sessionId) {
				logger.warn('SSE message received without sessionId');
				res
					.status(400)
					.json(JsonRpcErrors.invalidParams('sessionId is required', extractJsonRpcId(req.body)));
				return;
			}

			const connection = this.sseConnections.get(sessionId);

			if (!connection) {
				logger.warn({ sessionId }, 'SSE message for unknown session');
				res.status(404).json(JsonRpcErrors.sessionNotFound(sessionId, extractJsonRpcId(req.body)));
				return;
			}

			// Update last activity
			connection.lastActivity = new Date();

			// Handle message with the transport
			await connection.transport.handlePostMessage(req, res, req.body);

			logger.debug({ sessionId }, 'SSE message handled successfully');
		} catch (error) {
			logger.error({ error }, 'Error handling SSE message');

			if (!res.headersSent) {
				res
					.status(500)
					.json(
						JsonRpcErrors.internalError(
							extractJsonRpcId(req.body),
							'Internal server error handling SSE message'
						)
					);
			}
		}
	}

	private createCleanupFunction(sessionId: string): () => Promise<void> {
		return async () => {
			try {
				const connection = this.sseConnections.get(sessionId);
				if (!connection) return;

				logger.debug({ sessionId }, 'Cleaning up SSE connection');

				// Clear heartbeat interval
				if (connection.heartbeatInterval) {
					clearInterval(connection.heartbeatInterval);
				}

				// Close transport
				try {
					await connection.transport.close();
				} catch (error) {
					logger.error({ error, sessionId }, 'Error closing transport');
				}

				// Remove from map
				this.sseConnections.delete(sessionId);

				logger.debug({ sessionId }, 'SSE connection cleaned up');
			} catch (error) {
				logger.error({ error, sessionId }, 'Error during SSE connection cleanup');
			}
		};
	}

	private async connectWithCleanup(
		transport: SSEServerTransport,
		sessionId: string,
		cleanup: () => Promise<void>
	): Promise<void> {
		try {
			await this.server.connect(transport);
		} catch (error) {
			logger.error({ error, sessionId }, 'Failed to connect transport to server');
			await cleanup();
			throw error;
		}
	}

	private setupGracefulShutdown(): void {
		const gracefulShutdown = async (signal: string) => {
			logger.info(
				{ signal, activeConnections: this.sseConnections.size },
				'Received shutdown signal, cleaning up SSE connections'
			);

			this.isShuttingDown = true;

			// Clean up all connections
			await this.cleanup();

			logger.info('Graceful shutdown complete');
		};

		// Handle various shutdown signals
		(['SIGINT', 'SIGTERM', 'SIGQUIT'] as const).forEach((signal) => {
			process.once(signal, () => {
				gracefulShutdown(signal).catch((error: unknown) => {
					logger.error({ error }, 'Error during graceful shutdown');
				});
			});
		});

		// Handle uncaught exceptions
		process.once('uncaughtException', (error: unknown) => {
			logger.error({ error }, 'Uncaught exception, cleaning up SSE connections');
			gracefulShutdown('uncaughtException')
				.then(() => {
					process.exit(1);
				})
				.catch(() => {
					process.exit(1);
				});
		});

		process.once('unhandledRejection', (reason: unknown) => {
			logger.error({ reason }, 'Unhandled rejection, cleaning up SSE connections');
			gracefulShutdown('unhandledRejection')
				.then(() => {
					process.exit(1);
				})
				.catch(() => {
					process.exit(1);
				});
		});
	}

	async cleanup(): Promise<void> {
		logger.info(
			{
				activeConnections: this.sseConnections.size,
			},
			'Starting SSE transport cleanup'
		);

		// Get all session IDs to avoid mutation during iteration
		const sessionIds = Array.from(this.sseConnections.keys());

		// Close all connections in parallel
		const cleanupPromises = sessionIds.map((sessionId) =>
			this.closeConnection(sessionId).catch((error: unknown) => {
				logger.error({ error, sessionId }, 'Error during connection cleanup');
			})
		);

		await Promise.allSettled(cleanupPromises);

		// Ensure map is cleared
		this.sseConnections.clear();

		logger.info('SSE transport cleanup completed');
	}

	// Public management methods

	/**
	 * Get the number of active SSE connections
	 */
	getActiveConnectionCount(): number {
		return this.sseConnections.size;
	}

	/**
	 * Get all active session IDs with metadata
	 */
	getActiveConnections(): Array<{
		sessionId: string;
		createdAt: Date;
		lastActivity: Date;
		age: number;
	}> {
		return Array.from(this.sseConnections.entries()).map(([sessionId, conn]) => ({
			sessionId,
			createdAt: conn.createdAt,
			lastActivity: conn.lastActivity,
			age: Date.now() - conn.createdAt.getTime(),
		}));
	}

	/**
	 * Force close a specific connection
	 */
	async closeConnection(sessionId: string): Promise<boolean> {
		const connection = this.sseConnections.get(sessionId);
		if (!connection) {
			logger.debug({ sessionId }, 'Attempted to close non-existent connection');
			return false;
		}

		try {
			await connection.cleanup();
			return true;
		} catch (error) {
			logger.error({ error, sessionId }, 'Error closing connection');
			return false;
		}
	}

	/**
	 * Close stale connections (connections inactive for specified duration)
	 */
	async closeStaleConnections(maxInactivityMs: number = 3600000): Promise<number> {
		const now = Date.now();
		let closedCount = 0;

		for (const [sessionId, conn] of Array.from(this.sseConnections.entries())) {
			const inactivityDuration = now - conn.lastActivity.getTime();
			if (inactivityDuration > maxInactivityMs) {
				logger.info({ sessionId, inactivityDuration }, 'Closing stale connection');
				if (await this.closeConnection(sessionId)) {
					closedCount++;
				}
			}
		}

		return closedCount;
	}

	/**
	 * Check if server is accepting new connections
	 */
	isAcceptingConnections(): boolean {
		return !this.isShuttingDown;
	}
}
