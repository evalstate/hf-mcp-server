import { StatefulTransport, type TransportOptions, type BaseSession } from './base-transport.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { logger } from '../utils/logger.js';
import type { Request, Response } from 'express';
import { JsonRpcErrors, extractJsonRpcId } from './json-rpc-errors.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { extractQueryParamsToHeaders } from '../utils/query-params.js';

interface SSEConnection extends BaseSession<SSEServerTransport> {
	cleanup: () => Promise<void>;
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
		this.startPingKeepAlive();

		logger.info('SSE transport routes initialized', {
			heartbeatInterval: this.HEARTBEAT_INTERVAL,
			staleCheckInterval: this.STALE_CHECK_INTERVAL,
			staleTimeout: this.STALE_TIMEOUT,
			pingEnabled: this.PING_ENABLED,
			pingInterval: this.PING_INTERVAL,
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
				} else {
					// Session not found - track failed resumption
					this.metrics.trackSessionResumeFailed();
					logger.debug({ sessionId: existingSessionId }, 'Session not found for reconnection');
				}
			}

			// Create server instance using factory with request headers and query params
			const headers = req.headers as Record<string, string>;
			extractQueryParamsToHeaders(req, headers);

			// Validate auth and track metrics
			const authResult = await this.validateAuthAndTrackMetrics(headers);
			if (!authResult.shouldContinue) {
				this.trackError(authResult.statusCode);
				res.status(authResult.statusCode || 401).send('Unauthorized');
				return;
			}

			// Create new transport
			const transport = new SSEServerTransport('/message', res);
			const sessionId = transport.sessionId;
			
			// Create server with session info (client info will be updated after initialization)
			const isAuthenticated = authResult.shouldContinue && !!headers['authorization'];
			const server = await this.serverFactory(headers, undefined, false, {
				clientSessionId: sessionId,
				isAuthenticated,
			});

			logger.info({ sessionId }, 'New SSE connection established');

			// Create comprehensive cleanup function
			const cleanup = this.createCleanupFunction(sessionId);

			// Store connection with metadata
			const connection: SSEConnection = {
				transport,
				server,
				cleanup,
				metadata: {
					id: sessionId,
					connectedAt: new Date(),
					lastActivity: new Date(),
					requestCount: 0,
					isAuthenticated: authResult.shouldContinue && !!headers['authorization'],
					capabilities: {},
				},
			};

			this.sessions.set(sessionId, connection);

			// Track the session creation for metrics
			this.trackSessionCreated(sessionId);

			// Set up heartbeat and connection event handlers
			this.startHeartbeat(sessionId, res);
			this.setupSseEventHandlers(sessionId, res);

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
		const trackingName = this.extractMethodForTracking(req.body);

		try {
			const sessionId = req.query.sessionId as string;

			if (!sessionId) {
				logger.warn('SSE message received without sessionId');
				this.trackError(400);
				// Track method call without timing (stateful mode measures HTTP dispatch time, not MCP processing time)
				this.metrics.trackMethod(trackingName, undefined, true);
				res.status(400).json(JsonRpcErrors.invalidParams('sessionId is required', extractJsonRpcId(req.body)));
				return;
			}

			const connection = this.sessions.get(sessionId);

			if (!connection) {
				logger.warn({ sessionId }, 'SSE message for unknown session');
				this.trackError(404);
				this.metrics.trackMethod(trackingName, undefined, true);
				res.status(404).json(JsonRpcErrors.sessionNotFound(sessionId, extractJsonRpcId(req.body)));
				return;
			}

			// Update last activity using base class helper
			this.updateSessionActivity(sessionId);

			// Increment request count only for actual method calls (not responses or pings)
			if (trackingName) {
				const session = this.sessions.get(sessionId);
				if (session) {
					session.metadata.requestCount++;
				}
			}

			// Handle message with the transport
			await connection.transport.handlePostMessage(req, res, req.body);

			// Track successful method call without timing (stateful mode measures HTTP dispatch time, not MCP processing time)
			this.metrics.trackMethod(trackingName, undefined, false);

			logger.debug({ sessionId }, 'SSE message handled successfully');
		} catch (error) {
			logger.error({ error }, 'Error handling SSE message');
			this.trackError(500, error instanceof Error ? error : new Error(String(error)));
			this.metrics.trackMethod(trackingName, undefined, true);

			if (!res.headersSent) {
				res
					.status(500)
					.json(JsonRpcErrors.internalError(extractJsonRpcId(req.body), 'Internal server error handling SSE message'));
			}
		}
	}

	private createCleanupFunction(sessionId: string): () => Promise<void> {
		return () => this.cleanupSession(sessionId);
	}

	private async connectWithCleanup(
		transport: SSEServerTransport,
		server: McpServer,
		sessionId: string,
		cleanup: () => Promise<void>
	): Promise<void> {
		try {
			// Set up standard server configuration
			this.setupServerForSession(server, sessionId);

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
		await this.cleanupSession(sessionId);
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

		// Use base class cleanup method
		await this.cleanupAllSessions();

		logger.info('SSE transport cleanup completed');
	}

	/**
	 * Force close a specific connection
	 */
	async closeConnection(sessionId: string): Promise<boolean> {
		const session = this.sessions.get(sessionId);
		if (!session) {
			logger.debug({ sessionId }, 'Attempted to close non-existent connection');
			return false;
		}

		try {
			await this.cleanupSession(sessionId);
			return true;
		} catch (error) {
			logger.error({ error, sessionId }, 'Error closing connection');
			return false;
		}
	}
}
