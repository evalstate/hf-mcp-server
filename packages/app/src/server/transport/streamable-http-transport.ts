import { BaseTransport, type TransportOptions } from './base-transport.js';
import { StreamableHTTPServerTransport, type StreamableHTTPServerTransportOptions } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { InMemoryEventStore } from '@modelcontextprotocol/sdk/examples/shared/inMemoryEventStore.js';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Express, Request, Response } from 'express';
import { logger } from '../lib/logger.js';

/**
 * Implementation of StreamableHTTP transport
 */
export class StreamableHttpTransport extends BaseTransport {
	private transports: Map<string, StreamableHTTPServerTransport> = new Map();
	private enableJsonResponse: boolean;

	constructor(server: McpServer, app: Express, enableJsonResponse: boolean = false) {
		super(server, app);
		this.enableJsonResponse = enableJsonResponse;
	}

	async initialize(_options: TransportOptions): Promise<void> {
		const enableJsonResponse = this.enableJsonResponse;

		// Handle POST requests for JSON-RPC
		this.app.post('/mcp', (req: Request, res: Response) => {
			void (async () => {
				try {
				// Check for existing session ID
				const sessionId = req.headers['mcp-session-id'] as string | undefined;
				let transport: StreamableHTTPServerTransport;

				if (sessionId && this.transports.has(sessionId)) {
					// Reuse existing transport
					const existingTransport = this.transports.get(sessionId);
					if (!existingTransport) {
						// This shouldn't happen if has() returned true
						throw new Error('Transport disappeared between has() and get()');
					}
					transport = existingTransport;

					logger.debug({ sessionId }, 'Handling POST request for session');
				} else if (!sessionId) {
					// New initialization request
					const eventStore = new InMemoryEventStore();

					// Create appropriate config based on JSON mode
					const transportConfig: StreamableHTTPServerTransportOptions = {
						enableJsonResponse,
						eventStore, // Enable resumability
						onsessioninitialized: (sessionId: string) => {
							logger.debug({ sessionId }, 'Session initialized');
							this.transports.set(sessionId, transport);
						},
						// sessionIdGenerator is required, use undefined for JSON mode
						sessionIdGenerator: enableJsonResponse ? undefined : () => randomUUID(),
					};

					transport = new StreamableHTTPServerTransport(transportConfig);

					// Set up onclose handler to clean up transport when closed
					transport.onclose = () => {
						const sid = transport.sessionId;
						if (sid && this.transports.has(sid)) {
							logger.debug({ sessionId: sid }, 'Transport closed, removing from transports map');
							this.transports.delete(sid);
						}
					};

					// Connect the transport to the MCP server
					await this.server.connect(transport);

					await transport.handleRequest(req as IncomingMessage, res as ServerResponse, req.body);
					return;
				} else {
					// Invalid request - no session ID or not initialization request
					res.status(400).json({
						jsonrpc: '2.0',
						error: {
							code: -32000,
							message: 'Bad Request: No valid session ID provided',
						},
						id: null,
					});
					return;
				}

				// Handle the request with existing transport
				await transport.handleRequest(req as IncomingMessage, res as ServerResponse, req.body);
			} catch (error) {
				logger.error({ error }, 'Error handling MCP request');
				if (!res.headersSent) {
					res.status(500).json({
						jsonrpc: '2.0',
						error: {
							code: -32603,
							message: 'Internal server error',
						},
						id: null,
					});
				}
			}
			})();
		});

		// Handle GET requests for SSE streams
		this.app.get('/mcp', (req: Request, res: Response) => {
			void (async () => {
			const sessionId = req.headers['mcp-session-id'] as string | undefined;
			logger.debug({ sessionId }, 'Received MCP GET request');
			if (!sessionId || !this.transports.has(sessionId)) {
				res.status(400).json({
					jsonrpc: '2.0',
					error: {
						code: -32000,
						message: 'Bad Request: No valid session ID provided',
					},
					id: null,
				});
				return;
			}
			logger.debug({ sessionId }, 'Handling GET request for session');
			const transport = this.transports.get(sessionId);
			if (!transport) {
				// This was already checked above, but TypeScript doesn't know that
				res.status(400).json({
					jsonrpc: '2.0',
					error: {
						code: -32000,
						message: 'Session not found',
					},
					id: null,
				});
				return;
			}
			await transport.handleRequest(req as IncomingMessage, res as ServerResponse, req.body);
			})();
		});

		// Handle DELETE requests for session termination
		this.app.delete('/mcp', (req: Request, res: Response) => {
			void (async () => {
				const sessionId = req.headers['mcp-session-id'] as string | undefined;
			if (!sessionId || !this.transports.has(sessionId)) {
				res.status(400).json({
					jsonrpc: '2.0',
					error: {
						code: -32000,
						message: 'Bad Request: No valid session ID provided',
					},
					id: null,
				});
				return;
			}

			logger.debug({ sessionId }, 'Received session termination request');

			try {
				const transport = this.transports.get(sessionId);
				if (!transport) {
					throw new Error('Transport not found for session ' + sessionId);
				}
				await transport.handleRequest(req as IncomingMessage, res as ServerResponse, req.body);
			} catch (error) {
				logger.error({ error, sessionId }, 'Error handling session termination');
				if (!res.headersSent) {
					res.status(500).json({
						jsonrpc: '2.0',
						error: {
							code: -32603,
							message: 'Error handling session termination',
						},
						id: null,
					});
				}
			}
			})();
		});

		logger.info('StreamableHTTP transport routes initialized');
		logger.info({ jsonResponseMode: enableJsonResponse ? 'enabled' : 'disabled' }, 'JSON Response mode');
		if (enableJsonResponse) {
			logger.debug('SessionIdGenerator: undefined (not needed in JSON mode)');
		} else {
			logger.debug('SessionIdGenerator: randomUUID (used for SSE streaming)');
		}
		// No await needed at top level, but method must be async to match base class
		return Promise.resolve();
	}

	async cleanup(): Promise<void> {
		logger.info('Cleaning up StreamableHTTP transport');

		// Close all active transports
		for (const [sessionId, transport] of this.transports.entries()) {
			try {
				// The transport may have an onclose handler we need to respect
				if (transport.onclose) {
					transport.onclose();
				}
				this.transports.delete(sessionId);
			} catch (error) {
				logger.error({ error, sessionId }, 'Error closing transport for session');
			}
		}
		// No await needed, but method must be async to match base class
		return Promise.resolve();
	}
}
