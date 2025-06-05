import { StatefulTransport, type TransportOptions, type BaseSession } from './base-transport.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { logger } from '../lib/logger.js';
import type { Request, Response } from 'express';
import { JsonRpcErrors, extractJsonRpcId } from './json-rpc-errors.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

interface SSEConnection extends BaseSession<SSEServerTransport> {
	cleanup: () => Promise<void>;
	heartbeatInterval?: NodeJS.Timeout;
}

export class SseTransport extends StatefulTransport<SSEConnection> {
	async initialize(_options: TransportOptions): Promise<void> {
		// SSE endpoint for client connections
		this.app.get('/sse', (req: Request, res: Response) => {
			this.trackRequest();
			void this.handleSseConnection(req, res);
		});

		// Handle messages for all SSE sessions
		this.app.post('/message', (req: Request, res: Response) => {
			this.trackRequest();
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
				this.trackError(503);
				res.status(503).json(JsonRpcErrors.serverShuttingDown());
				return;
			}

			const existingSessionId = req.query.sessionId as string | undefined;
			const bouquet = req.query.bouquet as string | undefined;

			// Handle reconnection attempts
			if (existingSessionId) {
				const existing = this.sessions.get(existingSessionId);
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

			// Create server instance using factory with request headers and bouquet
			const headers = req.headers as Record<string, string>;
			if (bouquet) {
				headers['x-mcp-bouquet'] = bouquet;
			}
			const server = await this.serverFactory(headers);

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
				server,
				cleanup,
				heartbeatInterval,
				metadata: {
					id: sessionId,
					connectedAt: new Date(),
					lastActivity: new Date(),
					capabilities: {},
				},
			};

			this.sessions.set(sessionId, connection);

			// Track the session creation for metrics
			this.trackSessionCreated();

			// Set up connection event handlers
			res.on('close', () => {
				logger.info({ sessionId }, 'SSE connection closed by client');
				void cleanup();
			});

			res.on('error', (error) => {
				logger.error({ error, sessionId }, 'SSE connection error');
				this.trackError(500, error);
				void cleanup();
			});

			// Connect to server with proper cleanup handling
			await this.connectWithCleanup(transport, server, sessionId, cleanup);

			logger.debug({ sessionId }, 'SSE transport fully initialized');
		} catch (error) {
			logger.error({ error }, 'Error establishing SSE connection');
			this.trackError(500, error instanceof Error ? error : new Error(String(error)));

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
				this.trackError(400);
				res.status(400).json(JsonRpcErrors.invalidParams('sessionId is required', extractJsonRpcId(req.body)));
				return;
			}

			const connection = this.sessions.get(sessionId);

			if (!connection) {
				logger.warn({ sessionId }, 'SSE message for unknown session');
				this.trackError(404);
				res.status(404).json(JsonRpcErrors.sessionNotFound(sessionId, extractJsonRpcId(req.body)));
				return;
			}

			// Update last activity using base class helper
			this.updateSessionActivity(sessionId);

			// Handle message with the transport
			await connection.transport.handlePostMessage(req, res, req.body);

			logger.debug({ sessionId }, 'SSE message handled successfully');
		} catch (error) {
			logger.error({ error }, 'Error handling SSE message');
			this.trackError(500, error instanceof Error ? error : new Error(String(error)));

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
				const connection = this.sessions.get(sessionId);
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

				// Remove from map and track cleanup
				this.trackSessionCleaned(connection);
				this.sessions.delete(sessionId);

				logger.debug({ sessionId }, 'SSE connection cleaned up');
			} catch (error) {
				logger.error({ error, sessionId }, 'Error during SSE connection cleanup');
			}
		};
	}

	private async connectWithCleanup(
		transport: SSEServerTransport,
		server: McpServer,
		sessionId: string,
		cleanup: () => Promise<void>
	): Promise<void> {
		try {
			// Set up oninitialized callback to capture client info using base class helper
			server.server.oninitialized = this.createClientInfoCapture(sessionId);

			// Set up error tracking for server errors
			server.server.onerror = (error) => {
				this.trackError(undefined, error);
				logger.error({ error, sessionId }, 'SSE server error');
			};

			await server.connect(transport);
		} catch (error) {
			logger.error({ error, sessionId }, 'Failed to connect transport to server');
			this.trackError(500, error instanceof Error ? error : new Error(String(error)));
			await cleanup();
			throw error;
		}
	}

	/**
	 * Remove a stale session - implementation for StatefulTransport
	 */
	protected async removeStaleSession(sessionId: string): Promise<void> {
		logger.info({ sessionId }, 'Removing stale SSE connection');
		await this.closeConnection(sessionId);
	}

	async cleanup(): Promise<void> {
		logger.info(
			{
				activeConnections: this.sessions.size,
			},
			'Starting SSE transport cleanup'
		);

		// Stop stale checker using base class helper
		this.stopStaleConnectionCheck();

		// Get all session IDs to avoid mutation during iteration
		const sessionIds = Array.from(this.sessions.keys());

		// Close all connections in parallel
		const cleanupPromises = sessionIds.map((sessionId) =>
			this.closeConnection(sessionId).catch((error: unknown) => {
				logger.error({ error, sessionId }, 'Error during connection cleanup');
			})
		);

		await Promise.allSettled(cleanupPromises);

		// Ensure map is cleared
		this.sessions.clear();

		logger.info('SSE transport cleanup completed');
	}

	/**
	 * Force close a specific connection
	 */
	async closeConnection(sessionId: string): Promise<boolean> {
		const connection = this.sessions.get(sessionId);
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
}
