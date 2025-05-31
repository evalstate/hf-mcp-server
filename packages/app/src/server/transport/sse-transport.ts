import { BaseTransport, type TransportOptions, type SessionMetadata, type SessionInfo } from './base-transport.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { logger } from '../lib/logger.js';
import type { Request, Response } from 'express';
import { JsonRpcErrors, extractJsonRpcId } from './json-rpc-errors.js';
import type { ZodObject, ZodLiteral } from 'zod';

interface SSEConnection {
	transport: SSEServerTransport;
	cleanup: () => Promise<void>;
	heartbeatInterval?: NodeJS.Timeout;
	metadata: SessionMetadata;
}

export class SseTransport extends BaseTransport {
	// Store SSE connections with comprehensive metadata
	private sseConnections: Map<string, SSEConnection> = new Map();
	private isShuttingDown = false;
	private staleCheckInterval?: NodeJS.Timeout;

	// Configuration from environment variables
	private readonly STALE_CHECK_INTERVAL = parseInt(process.env.MCP_CLIENT_CONNECTION_CHECK || '30000', 10);
	private readonly STALE_TIMEOUT = parseInt(process.env.MCP_CLIENT_CONNECTION_TIMEOUT || '60000', 10);


	async initialize(_options: TransportOptions): Promise<void> {
		// SSE endpoint for client connections
		this.app.get('/sse', (req: Request, res: Response) => {
			void this.handleSseConnection(req, res);
		});

		// Handle messages for all SSE sessions
		this.app.post('/message', (req: Request, res: Response) => {
			void this.handleSseMessage(req, res);
		});

		this.startStaleConnectionCheck();

		logger.info('SSE transport routes initialized', {
			staleCheckInterval: this.STALE_CHECK_INTERVAL,
			staleTimeout: this.STALE_TIMEOUT,
		});
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
							age: Date.now() - existing.metadata.connectedAt.getTime(),
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
				metadata: {
					id: sessionId,
					connectedAt: new Date(),
					lastActivity: new Date(),
					capabilities: {},
				},
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
				res.status(400).json(JsonRpcErrors.invalidParams('sessionId is required', extractJsonRpcId(req.body)));
				return;
			}

			const connection = this.sseConnections.get(sessionId);

			if (!connection) {
				logger.warn({ sessionId }, 'SSE message for unknown session');
				res.status(404).json(JsonRpcErrors.sessionNotFound(sessionId, extractJsonRpcId(req.body)));
				return;
			}

			// Update last activity
			connection.metadata.lastActivity = new Date();

			// Handle message with the transport
			await connection.transport.handlePostMessage(req, res, req.body);

			logger.debug({ sessionId }, 'SSE message handled successfully');
		} catch (error) {
			logger.error({ error }, 'Error handling SSE message');

			if (!res.headersSent) {
				res
					.status(500)
					.json(JsonRpcErrors.internalError(extractJsonRpcId(req.body), 'Internal server error handling SSE message'));
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

			// Set up client info capture
			this.setupClientInfoCapture(transport, sessionId);
		} catch (error) {
			logger.error({ error, sessionId }, 'Failed to connect transport to server');
			await cleanup();
			throw error;
		}
	}

	private startStaleConnectionCheck(): void {
		this.staleCheckInterval = setInterval(() => {
			if (this.isShuttingDown) return;

			const now = Date.now();
			const staleSessionIds: string[] = [];

			// Find stale sessions
			for (const [sessionId, connection] of this.sseConnections) {
				const timeSinceActivity = now - connection.metadata.lastActivity.getTime();
				if (timeSinceActivity > this.STALE_TIMEOUT) {
					staleSessionIds.push(sessionId);
				}
			}

			// Remove stale sessions
			for (const sessionId of staleSessionIds) {
				const connection = this.sseConnections.get(sessionId);
				if (connection) {
					logger.info(
						{ sessionId, timeSinceActivity: now - connection.metadata.lastActivity.getTime() },
						'Removing stale SSE connection'
					);
					void this.closeConnection(sessionId);
				}
			}
		}, this.STALE_CHECK_INTERVAL);
	}

	/**
	 * Mark transport as shutting down (called by entry point)
	 */
	override shutdown(): void {
		this.isShuttingDown = true;
	}

	async cleanup(): Promise<void> {
		logger.info(
			{
				activeConnections: this.sseConnections.size,
			},
			'Starting SSE transport cleanup'
		);

		// Stop stale checker
		if (this.staleCheckInterval) {
			clearInterval(this.staleCheckInterval);
			this.staleCheckInterval = undefined;
		}

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
	override getActiveConnectionCount(): number {
		return this.sseConnections.size;
	}

	/**
	 * Get all active sessions with metadata
	 */
	override getActiveSessions(): SessionInfo[] {
		const now = Date.now();

		return Array.from(this.sseConnections.values()).map((conn) => ({
			id: conn.metadata.id,
			connectedAt: conn.metadata.connectedAt.toISOString(),
			lastActivity: conn.metadata.lastActivity.toISOString(),
			timeSinceActivity: now - conn.metadata.lastActivity.getTime(),
			clientInfo: conn.metadata.clientInfo,
			capabilities: conn.metadata.capabilities,
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
	 * Check if server is accepting new connections
	 */
	isAcceptingConnections(): boolean {
		return !this.isShuttingDown;
	}

	private setupClientInfoCapture(transport: SSEServerTransport, sessionId: string): void {
		// Intercept the server's initialization handler to capture client info
		const originalSetHandler = this.server.server.setRequestHandler.bind(this.server.server);
		const connections = this.sseConnections;

		// Type-safe wrapper that preserves the original signature
		this.server.server.setRequestHandler = function <T extends ZodObject<{ method: ZodLiteral<string> }>>(
			schema: T,
			handler: Parameters<typeof originalSetHandler<T>>[1]
		): void {
			// Check if this is the initialize request handler by examining the method
			if (schema.shape.method.value === 'initialize') {
				interface InitRequest {
					params?: {
						clientInfo?: { name: string; version: string };
						capabilities?: {
							sampling?: unknown;
							tools?: unknown;
							resources?: unknown;
						};
					};
				}

				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const wrappedHandler = async (request: any, extra: any) => {
					// Capture client info for this specific transport/session
					if (connections.has(sessionId)) {
						const connection = connections.get(sessionId);
						// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
						if (!connection) return await handler(request, extra);

						const typedRequest = request as InitRequest;
						if (typedRequest.params?.clientInfo) {
							connection.metadata.clientInfo = {
								name: typedRequest.params.clientInfo.name,
								version: typedRequest.params.clientInfo.version,
							};
						}

						if (typedRequest.params?.capabilities) {
							Object.assign(connection.metadata.capabilities, {
								sampling: !!typedRequest.params.capabilities.sampling,
								tools: !!typedRequest.params.capabilities.tools,
								resources: !!typedRequest.params.capabilities.resources,
							});
						}

						logger.info(
							{
								sessionId,
								clientInfo: connection.metadata.clientInfo,
								capabilities: connection.metadata.capabilities,
							},
							'Client info captured'
						);
					}

					// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
					return await handler(request, extra);
				};

				// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
				originalSetHandler(schema, wrappedHandler as any);
				return;
			}

			originalSetHandler(schema, handler);
		};
	}
}
