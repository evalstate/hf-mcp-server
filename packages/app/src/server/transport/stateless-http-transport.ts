import { BaseTransport, type TransportOptions, STATELESS_MODE, type SessionMetadata } from './base-transport.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { logger } from '../lib/logger.js';
import type { Request, Response } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { JsonRpcErrors, extractJsonRpcId } from './json-rpc-errors.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { isJSONRPCNotification } from '@modelcontextprotocol/sdk/types.js';
import { extractQueryParamsToHeaders } from '../utils/query-params.js';
import { isBrowser } from '../utils/browser-detection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Stateless HTTP JSON transport implementation
 * Creates a new server AND transport instance for each request to ensure complete isolation
 */
export class StatelessHttpTransport extends BaseTransport {
	/**
	 * Determines if a request should be handled by the full server
	 * or can be handled by the stub responder
	 */
	private shouldHandle(requestBody: unknown): boolean {
		const body = requestBody as { method?: string } | undefined;
		const method = body?.method;

		// Always handle tool-related requests
		if (method === 'tools/list' || method === 'tools/call') {
			return true;
		}

		// Always handle prompt-related requests
		if (method === 'prompts/list' || method === 'prompts/get') {
			return true;
		}

		// Handle initialize to set up client tracking
		if (method === 'initialize') {
			return true;
		}

		// All other requests can be handled by stub responder
		return false;
	}

	initialize(_options: TransportOptions): Promise<void> {
		// Handle POST requests (the only valid method for stateless JSON-RPC)
		this.app.post('/mcp', (req: Request, res: Response) => {
			this.trackRequest();
			void this.handleJsonRpcRequest(req, res);
		});

		// Serve the MCP welcome page on GET requests (or 405 if strict compliance is enabled)
		this.app.get('/mcp', (req: Request, res: Response) => {
			// Check for strict compliance mode or non-browser client
			if (process.env.MCP_STRICT_COMPLIANCE === 'true' || !isBrowser(req.headers)) {
				this.metrics.trackStaticPageHit(405);
				logger.debug('Rejected GET request to /mcp in strict compliance mode or from non-browser client');
				res
					.status(405)
					.json(JsonRpcErrors.methodNotAllowed(null, 'Method not allowed. Use POST for stateless JSON-RPC requests.'));
				return;
			}

			// Check if the request is not secure and redirect to HTTPS (skip for localhost)
			const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
			const host = req.get('host') || '';
			const isLocalhost =
				host === 'localhost' || host.startsWith('localhost:') || host === '127.0.0.1' || host.startsWith('127.0.0.1:');
			if (!isSecure && !isLocalhost) {
				const httpsUrl = `https://${host}${req.originalUrl}`;
				logger.debug(`Redirecting insecure request to HTTPS: ${httpsUrl}`);
				res.redirect(301, httpsUrl);
				return;
			}

			// Track successful static page hit
			this.metrics.trackStaticPageHit(200);

			// Serve the MCP welcome page (always serve the self-contained version)
			const mcpWelcomePath = path.join(__dirname, '..', '..', 'web', 'mcp-welcome.html');
			res.sendFile(mcpWelcomePath);
		});

		// Explicitly reject DELETE requests
		this.app.delete('/mcp', (_req: Request, res: Response) => {
			this.trackRequest();
			this.trackError(405);
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

		// Check HF token validity if present
		const headers = req.headers as Record<string, string>;
		extractQueryParamsToHeaders(req, headers);
		// Extract method name for tracking using shared utility
		const requestBody = req.body as
			| { method?: string; params?: { clientInfo?: unknown; capabilities?: unknown; name?: string } }
			| undefined;

		const trackingName = this.extractMethodForTracking(requestBody);

		const authResult = await this.validateAuthAndTrackMetrics(headers);
		if (!authResult.shouldContinue || trackingName === 'tools/call:Authenticate') {
			res.set(
				'WWW-Authenticate',
				'Bearer resource_metadata="https://huggingface.co/.well-known/oauth-protected-resources/mcp"'
			);
			res.status(authResult.statusCode || 401).send('Unauthorized');
			return;
		}

		// Track new connection for metrics (each request is a "connection" in stateless mode)
		this.trackNewConnection();

		if (isJSONRPCNotification(req.body)) {
			this.trackMethodCall(trackingName, startTime, false);
			res.status(202).json({ jsonrpc: '2.0', result: null });
			return;
		}

		try {
			// Track client info for initialize requests
			if (requestBody?.method === 'initialize' && requestBody?.params) {
				const clientInfo = requestBody.params.clientInfo as { name?: string; version?: string } | undefined;
				if (clientInfo?.name && clientInfo?.version) {
					this.associateSessionWithClient({ name: clientInfo.name, version: clientInfo.version });
					this.updateClientActivity({ name: clientInfo.name, version: clientInfo.version });
				}

				logger.debug(
					{
						clientInfo: requestBody.params.clientInfo,
						capabilities: requestBody.params.capabilities,
					},
					'Initialize request received'
				);
			}

			// Determine which server to use
			const useFullServer = this.shouldHandle(requestBody);

			if (useFullServer) {
				// Create new server instance using factory with request headers and bouquet
				extractQueryParamsToHeaders(req, headers);

				// Skip Gradio endpoints for initialize requests or non-Gradio tool calls
				const skipGradio = this.shouldSkipGradio(requestBody);
				server = await this.serverFactory(headers, undefined, skipGradio);
			} else {
				// Create fresh stub responder for simple requests
				server = new McpServer({ name: '@huggingface/internal-responder', version: '0.0.1' });
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

			// Set up error tracking for server errors
			server.server.onerror = (error) => {
				this.trackError(undefined, error);
				logger.error({ error }, 'Stateless HTTP server error');
			};

			// Connect and handle
			await server.connect(transport);

			await transport.handleRequest(req, res, req.body);

			// Track successful method call
			this.trackMethodCall(trackingName, startTime, false);

			logger.debug(
				{
					duration: Date.now() - startTime,
					method: trackingName,
					handledBy: useFullServer ? 'full' : 'stub',
				},
				'Request completed'
			);
		} catch (error) {
			logger.error({ error, method: trackingName }, 'Error handling request');

			// Track failed method call
			this.trackMethodCall(trackingName, startTime, true);

			this.trackError(500, error instanceof Error ? error : new Error(String(error)));

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
		// Stateless transports don't track active connections
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
