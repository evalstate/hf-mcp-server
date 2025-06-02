import { StatefulTransport, type TransportOptions, type BaseSession } from './base-transport.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { logger } from '../lib/logger.js';
import { JsonRpcErrors, extractJsonRpcId } from './json-rpc-errors.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';

type Session = BaseSession<StreamableHTTPServerTransport>;

export class StreamableHttpTransport extends StatefulTransport<Session> {

	initialize(_options: TransportOptions): Promise<void> {
		this.setupRoutes();
		this.startStaleConnectionCheck();

		logger.info('StreamableHTTP transport initialized', {
			staleCheckInterval: this.STALE_CHECK_INTERVAL,
			staleTimeout: this.STALE_TIMEOUT,
		});
		return Promise.resolve();
	}

	private setupRoutes(): void {
		// Initialize new session or handle existing session request
		this.app.post('/mcp', (req, res) => {
			void (async () => {
				await this.handleRequest(req, res, 'POST');
			})();
		});

		// SSE stream endpoint
		this.app.get('/mcp', (req, res) => {
			void (async () => {
				await this.handleRequest(req, res, 'GET');
			})();
		});

		// Session termination
		this.app.delete('/mcp', (req, res) => {
			void (async () => {
				await this.handleRequest(req, res, 'DELETE');
			})();
		});
	}

	private async handleRequest(req: Request, res: Response, method: string): Promise<void> {
		try {
			const sessionId = req.headers['mcp-session-id'] as string;

			// Update activity timestamp for existing sessions
			if (sessionId && this.sessions.has(sessionId)) {
				this.updateSessionActivity(sessionId);
			}

			switch (method) {
				case 'POST':
					await this.handlePostRequest(req, res, sessionId);
					break;
				case 'GET':
					await this.handleGetRequest(req, res, sessionId);
					break;
				case 'DELETE':
					await this.handleDeleteRequest(req, res, sessionId);
					break;
			}
		} catch (error) {
			logger.error({ error, method }, 'Request handling error');
			if (!res.headersSent) {
				res.status(500).json(JsonRpcErrors.internalError(extractJsonRpcId(req.body ?? null)));
			}
		}
	}

	private async handlePostRequest(req: Request, res: Response, sessionId?: string): Promise<void> {
		// Reject new connections during shutdown
		if (!sessionId && this.isShuttingDown) {
			res.status(503).json(JsonRpcErrors.serverShuttingDown(extractJsonRpcId(req.body)));
			return;
		}

		let transport: StreamableHTTPServerTransport;

		if (sessionId && this.sessions.has(sessionId)) {
			const existingSession = this.sessions.get(sessionId);
			if (!existingSession) {
				res.status(404).json(JsonRpcErrors.sessionNotFound(sessionId, extractJsonRpcId(req.body)));
				return;
			}
			transport = existingSession.transport;
		} else if (!sessionId && isInitializeRequest(req.body)) {
			// Create new session only for initialization requests
			const headers = req.headers as Record<string, string>;
			const bouquet = req.query.bouquet as string | undefined;
			if (bouquet) {
				headers['x-mcp-bouquet'] = bouquet;
			}
			transport = await this.createSession(headers);
		} else if (!sessionId) {
			// No session ID and not an initialization request
			res
				.status(400)
				.json(
					JsonRpcErrors.invalidRequest(extractJsonRpcId(req.body), 'Missing session ID for non-initialization request')
				);
			return;
		} else {
			// Invalid session ID
			res.status(404).json(JsonRpcErrors.sessionNotFound(sessionId, extractJsonRpcId(req.body)));
			return;
		}

		await transport.handleRequest(req, res, req.body);
	}

	private async handleGetRequest(req: Request, res: Response, sessionId?: string): Promise<void> {
		if (!sessionId || !this.sessions.has(sessionId)) {
			res.status(400).json(JsonRpcErrors.sessionNotFound(sessionId || 'missing', null));
			return;
		}

		const session = this.sessions.get(sessionId);
		if (!session) {
			res.status(404).json(JsonRpcErrors.sessionNotFound(sessionId, null));
			return;
		}

		const lastEventId = req.headers['last-event-id'];
		if (lastEventId) {
			logger.warn({ sessionId, lastEventId }, 'Client attempting to result with Last-Event-ID');
		}

		await session.transport.handleRequest(req, res);
	}

	private async handleDeleteRequest(req: Request, res: Response, sessionId?: string): Promise<void> {
		if (!sessionId || !this.sessions.has(sessionId)) {
			res.status(404).json(JsonRpcErrors.sessionNotFound(sessionId || 'missing', extractJsonRpcId(req.body)));
			return;
		}

		logger.info({ sessionId }, 'Session termination requested');

		const session = this.sessions.get(sessionId);
		if (!session) {
			res.status(404).json(JsonRpcErrors.sessionNotFound(sessionId, extractJsonRpcId(req.body)));
			return;
		}

		await session.transport.handleRequest(req, res, req.body);
		await this.removeSession(sessionId);
	}

	private async createSession(requestHeaders?: Record<string, string>): Promise<StreamableHTTPServerTransport> {
		// Create server instance using factory with request headers
		const server = await this.serverFactory(requestHeaders || null);

		const transport = new StreamableHTTPServerTransport({
			sessionIdGenerator: () => randomUUID(),
			onsessioninitialized: (sessionId: string) => {
				logger.info({ sessionId }, 'Session initialized');

				// Create session object and store it immediately
				const session: Session = {
					transport,
					server,
					metadata: {
						id: sessionId,
						connectedAt: new Date(),
						lastActivity: new Date(),
						capabilities: {},
					},
				};

				this.sessions.set(sessionId, session);
			},
		});

		// Set up cleanup on transport close
		transport.onclose = () => {
			const sessionId = transport.sessionId;
			if (sessionId && this.sessions.has(sessionId)) {
				logger.debug({ sessionId }, 'Transport closed, cleaning up session');
				void this.removeSession(sessionId);
			}
		};

		server.server.oninitialized = () => {
			const sessionId = transport.sessionId;
			if (sessionId) {
				this.createClientInfoCapture(sessionId)();
			}
		};

		// Connect to session-specific server
		await server.connect(transport);

		return transport;
	}

	private async removeSession(sessionId: string): Promise<void> {
		const session = this.sessions.get(sessionId);
		if (!session) return;

		try {
			await session.transport.close();
		} catch (error) {
			logger.error({ error, sessionId }, 'Error closing transport');
		}

		this.sessions.delete(sessionId);
		logger.debug({ sessionId }, 'Session removed');
	}

	/**
	 * Remove a stale session - implementation for StatefulTransport
	 */
	protected async removeStaleSession(sessionId: string): Promise<void> {
		logger.info({ sessionId }, 'Removing stale session');
		await this.removeSession(sessionId);
	}

	async cleanup(): Promise<void> {
		// Stop stale checker using base class helper
		this.stopStaleConnectionCheck();

		// Close all sessions gracefully
		const closePromises = Array.from(this.sessions.keys()).map((sessionId) =>
			this.removeSession(sessionId).catch((error: unknown) => {
				logger.error({ error, sessionId }, 'Error during cleanup');
			})
		);

		await Promise.allSettled(closePromises);

		this.sessions.clear();
		logger.info('StreamableHTTP transport cleanup complete');
	}
}
