import { BaseTransport, type TransportOptions, STATELESS_MODE, type SessionMetadata } from './base-transport.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { logger } from '../lib/logger.js';
import type { Request, Response } from 'express';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { JsonRpcErrors, extractJsonRpcId } from './json-rpc-errors.js';

/**
 * Stateless HTTP JSON transport implementation
 * Creates a new server AND transport instance for each request to ensure complete isolation
 */
export class StatelessHttpTransport extends BaseTransport {
	initialize(_options: TransportOptions): Promise<void> {
		// Handle POST requests (the only valid method for stateless JSON-RPC)
		this.app.post('/mcp', (req: Request, res: Response) => {
			void this.handleJsonRpcRequest(req, res);
		});

		// Explicitly reject GET requests
		this.app.get('/mcp', (_req: Request, res: Response) => {
			logger.debug('Rejected GET request to /mcp in stateless mode');
			res
				.status(405)
				.json(JsonRpcErrors.methodNotAllowed(null, 'Method not allowed. Use POST for stateless JSON-RPC requests.'));
		});

		// Explicitly reject DELETE requests
		this.app.delete('/mcp', (_req: Request, res: Response) => {
			logger.warn('Rejected DELETE request to /mcp in stateless mode');
			res
				.status(405)
				.json(JsonRpcErrors.methodNotAllowed(null, 'Method not allowed. Use POST for stateless JSON-RPC requests.'));
		});

		logger.info('HTTP JSON transport initialized (stateless mode)');
		return Promise.resolve();
	}
	private async handleJsonRpcRequest(req: Request, res: Response): Promise<void> {
		const startTime = Date.now();
		let server: McpServer | null = null;
		let transport: StreamableHTTPServerTransport | null = null;
		const requestBody = req.body as
			| { method?: string; params?: { clientInfo?: unknown; capabilities?: unknown } }
			| undefined;

		try {
			// Create new server instance using factory with request headers and bouquet
			logger.debug({ headerCount: Object.keys(req.headers).length }, 'Request received');
			logger.error({ headers: req.headers }, 'DO NOT USE ** NOT A PRODUCTION BUILD Request Headers');
			const headers = req.headers as Record<string, string>;
			const bouquet = req.query.bouquet as string | undefined;
			if (bouquet) {
				headers['x-mcp-bouquet'] = bouquet;
				logger.info({ bouquet }, 'Stateless HTTP: Passing bouquet parameter to server factory');
			}
			server = await this.serverFactory(headers);

			// After handling, check if it was an initialize request
			if (requestBody?.method === 'initialize') {
				logger.info(
					{
						clientInfo: requestBody.params?.clientInfo,
						capabilities: requestBody.params?.capabilities,
					},
					'Initialize request processed'
				);
			}

			// Create new transport instance for this request
			transport = new StreamableHTTPServerTransport({
				sessionIdGenerator: undefined,
				enableJsonResponse: true,
			});

			// Setup cleanup handlers - only cleanup on client disconnect
			const cleanup = async () => {
				if (transport) {
					await transport.close().catch((err: unknown) => {
						logger.warn({ error: err }, 'Error closing transport');
					});
				}
				if (server) {
					await server.close().catch((err: unknown) => {
						logger.warn({ error: err }, 'Error closing server');
					});
				}
			};

			// Only cleanup on early client disconnect
			res.on('close', () => {
				logger.debug('Client disconnected');
				void cleanup();
			});

			// Connect and handle
			await server.connect(transport);

			await transport.handleRequest(req, res, req.body);
			logger.debug(
				{
					duration: Date.now() - startTime,
					method: requestBody?.method,
				},
				'Request completed'
			);
		} catch (error) {
			logger.error({ error }, 'Error handling request');

			// Ensure cleanup on error
			if (transport) {
				await transport.close().catch(() => {
					// Ignore cleanup errors during error handling
				});
			}
			if (server) {
				await server.close().catch(() => {
					// Ignore cleanup errors during error handling
				});
			}

			if (!res.headersSent) {
				const id = extractJsonRpcId(req.body as unknown);
				res.status(500).json(JsonRpcErrors.internalError(id));
			}
		}
	}

	/**
	 * Mark transport as shutting down
	 */
	override shutdown(): void {
		// Stateless transport doesn't need to reject new connections
		logger.debug('Stateless HTTP transport shutdown signaled');
	}

	cleanup(): Promise<void> {
		// No persistent resources to clean up in stateless mode
		logger.info('HTTP JSON transport cleanup complete');
		return Promise.resolve();
	}

	/**
	 * Get the number of active connections - returns STATELESS_MODE for stateless transport
	 */
	getActiveConnectionCount(): number {
		return STATELESS_MODE;
	}

	/**
	 * Get all active sessions - returns empty array for stateless transport
	 */
	override getSessions(): SessionMetadata[] {
		// Stateless transport doesn't maintain sessions
		return [];
	}
}
