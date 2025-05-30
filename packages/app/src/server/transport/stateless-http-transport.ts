import { BaseTransport, type TransportOptions } from './base-transport.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { logger } from '../lib/logger.js';
import type { Request, Response, Express } from 'express';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { JsonRpcErrors, extractJsonRpcId } from './json-rpc-errors.js';

/**
 * Factory function to create server instances
 * This should be provided during transport construction
 */
// type ServerFactory = () => McpServer;

/**
 * Stateless HTTP JSON transport implementation
 * Creates a new server AND transport instance for each request to ensure complete isolation
 */
export class StatelessHttpTransport extends BaseTransport {
	// private serverFactory: ServerFactory;

	// constructor(serverFactory: ServerFactory, app: Express) {
	// 	super({} as McpServer, app);
	// 	this.serverFactory = serverFactory;
	// }

	constructor(server: McpServer, app: Express) {
		super(server, app);
		this.server = server;
	}
	initialize(_options: TransportOptions): Promise<void> {
		// Handle POST requests (the only valid method for stateless JSON-RPC)
		this.app.post('/mcp', (req: Request, res: Response) => {
			void this.handleJsonRpcRequest(req, res);
		});

		// Explicitly reject GET requests
		this.app.get('/mcp', (_req: Request, res: Response) => {
			logger.warn('Rejected GET request to /mcp in stateless mode');
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

		try {
			// Create new transport instance (keep server shared for efficiency)
			const transport = new StreamableHTTPServerTransport({
				sessionIdGenerator: undefined,
			});

			// Only cleanup on early client disconnect
			res.on('close', () => {
				logger.debug('Client disconnected');
				transport.close().catch((err: unknown) => {
					logger.warn({ error: err }, 'Error closing transport');
				});
			});

			// Connect and handle
			await this.server.connect(transport);
			await transport.handleRequest(req, res, req.body);

			// Log success
			logger.debug(
				{
					duration: Date.now() - startTime,
					method: (req.body as { method?: string } | undefined)?.method,
				},
				'Request completed'
			);
		} catch (error) {
			logger.error({ error }, 'Error handling request');

			if (!res.headersSent) {
				const id = extractJsonRpcId(req.body as unknown);
				res.status(500).json(JsonRpcErrors.internalError(id));
			}
		}
	}

	cleanup(): Promise<void> {
		// No persistent resources to clean up in stateless mode
		logger.info('HTTP JSON transport cleanup complete');
		return Promise.resolve();
	}
}
