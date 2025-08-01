import {
	BaseTransport,
	type TransportOptions,
	STATELESS_MODE,
	type SessionMetadata,
	type ServerFactory,
} from './base-transport.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { logger } from '../utils/logger.js';
import type { Request, Response, Express } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { JsonRpcErrors, extractJsonRpcId } from './json-rpc-errors.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { isJSONRPCNotification } from '@modelcontextprotocol/sdk/types.js';
import { extractQueryParamsToHeaders } from '../utils/query-params.js';
import { isBrowser } from '../utils/browser-detection.js';
import { OAUTH_RESOURCE } from '../../shared/constants.js';
import { randomUUID } from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Analytics session without server (server is null in analytics mode)
interface AnalyticsSession {
	transport: null;
	server: null;
	metadata: SessionMetadata;
}

/**
 * Stateless HTTP JSON transport implementation
 * Creates a new server AND transport instance for each request to ensure complete isolation
 *
 * In analytics mode (ANALYTICS_MODE=true), maintains session tracking for analytics purposes
 * without affecting the stateless nature of request processing
 */
export class StatelessHttpTransport extends BaseTransport {
	private readonly analyticsMode: boolean;
	private analyticsSessions: Map<string, AnalyticsSession> = new Map();

	constructor(serverFactory: ServerFactory, app: Express) {
		super(serverFactory, app);
		this.analyticsMode = process.env.ANALYTICS_MODE === 'true';

		if (this.analyticsMode) {
			logger.info(
				'Analytics mode enabled for stateless HTTP transport - no cleanup needed, can handle millions of sessions'
			);
		}
	}
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
		this.app.post('/mcp', (req: Request, res: Response) => {
			this.trackRequest();
			void this.handleJsonRpcRequest(req, res);
		});

		// Analytics mode doesn't need cleanup - can handle millions of sessions

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

		// Handle DELETE requests for analytics tracking
		this.app.delete('/mcp', (req: Request, res: Response) => {
			this.trackRequest();
			void this.handleDeleteRequest(req, res);
		});

		logger.info('HTTP JSON transport initialized (stateless mode)');
		return Promise.resolve();
	}

	private async handleJsonRpcRequest(req: Request, res: Response): Promise<void> {
		const startTime = Date.now();
		let server: McpServer | null = null;
		let transport: StreamableHTTPServerTransport | null = null;
		let sessionId: string | undefined;

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
			res.set('WWW-Authenticate', OAUTH_RESOURCE);
			res.status(authResult.statusCode || 401).send('Unauthorized');
			return;
		}

		// Analytics mode session tracking
		if (this.analyticsMode) {
			sessionId = headers['mcp-session-id'] || (req.query.sessionId as string);
			// Handle session creation/resumption
			if (requestBody?.method === 'initialize') {
				// Create new session
				sessionId = randomUUID();
				this.createAnalyticsSession(sessionId, authResult.shouldContinue && headers['authorization'] ? true : false);

				// Add session ID to response headers
				res.setHeader('MCP-Session-ID', sessionId);
			} else if (sessionId) {
				// Try to resume existing session
				if (this.analyticsSessions.has(sessionId)) {
					this.updateAnalyticsSessionActivity(sessionId);
				} else {
					// Session not found - track failed resumption and return 404
					this.metrics.trackSessionResumeFailed();
					this.trackError(404);
					logger.debug({ sessionId }, 'Analytics session not found for resumption');
					res.status(404).json(JsonRpcErrors.sessionNotFound(sessionId, extractJsonRpcId(req.body)));
					return;
				}
			}
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

					// Update analytics session with client info
					if (this.analyticsMode && sessionId) {
						this.updateAnalyticsSessionClientInfo(sessionId, { name: clientInfo.name, version: clientInfo.version });
					}
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
			let directResponse = true;
			if (useFullServer) {
				// Create new server instance using factory with request headers and bouquet
				extractQueryParamsToHeaders(req, headers);

				// Skip Gradio endpoints for initialize requests or non-Gradio tool calls
				const skipGradio = this.skipGradioSetup(requestBody);
				server = await this.serverFactory(headers, undefined, skipGradio);

				// For Gradio tool calls, disable direct response to enable streaming/progress notifications
				directResponse = !this.isGradioToolCall(requestBody);
			} else {
				// Create fresh stub responder for simple requests
				server = new McpServer({ name: '@huggingface/internal-responder', version: '0.0.1' });
			}

			// Create new transport instance for this request
			transport = new StreamableHTTPServerTransport({
				sessionIdGenerator: undefined,
				enableJsonResponse: directResponse,
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
			// Extract more error information for better debugging
			const errorInfo = {
				message: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
				name: error instanceof Error ? error.name : undefined,
				...(error && typeof error === 'object' ? error : {}),
			};

			logger.error(
				{
					error: errorInfo,
					method: trackingName,
					requestBody: requestBody?.method,
					headers: Object.keys(headers),
				},
				'Error handling request'
			);

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

	private async handleDeleteRequest(req: Request, res: Response): Promise<void> {
		if (!this.analyticsMode) {
			this.trackError(405);
			logger.warn('Rejected DELETE request to /mcp in stateless mode (analytics disabled)');
			res
				.status(405)
				.json(JsonRpcErrors.methodNotAllowed(null, 'Method not allowed. Use POST for stateless JSON-RPC requests.'));
			return;
		}

		const sessionId = (req.headers['mcp-session-id'] as string) || (req.query.sessionId as string);

		if (!sessionId) {
			this.trackError(400);
			res.status(400).json(JsonRpcErrors.invalidRequest(null, 'Session ID required for DELETE requests'));
			return;
		}

		if (this.analyticsSessions.has(sessionId)) {
			this.analyticsSessions.delete(sessionId);
			this.metrics.trackSessionDeleted();
			logger.info({ sessionId }, 'Analytics session deleted via DELETE request');
			res.status(200).json({ jsonrpc: '2.0', result: { deleted: true } });
		} else {
			this.trackError(404);
			logger.debug({ sessionId }, 'Analytics session not found for deletion');
			res.status(404).json(JsonRpcErrors.sessionNotFound(sessionId, null));
		}
	}

	/**
	 * Mark transport as shutting down
	 */
	override shutdown(): void {
		// Stateless transport doesn't need to reject new connections
		logger.debug('Stateless HTTP transport shutdown signaled');
	}

	/**
	 * Get the number of active connections - returns STATELESS_MODE for stateless transport
	 */
	getActiveConnectionCount(): number {
		// In analytics mode, return the number of tracked sessions
		if (this.analyticsMode) {
			return this.analyticsSessions.size;
		}
		// Stateless transports don't track active connections
		return STATELESS_MODE;
	}

	/**
	 * Get all active sessions - returns empty array for stateless transport
	 */
	override getSessions(): SessionMetadata[] {
		// In analytics mode, return tracked sessions
		if (this.analyticsMode) {
			return Array.from(this.analyticsSessions.values()).map((session) => session.metadata);
		}
		// Stateless transport doesn't maintain sessions
		return [];
	}

	/**
	 * Clean up resources
	 */
	async cleanup(): Promise<void> {
		// Clear analytics sessions if needed
		this.analyticsSessions.clear();
		logger.info('HTTP JSON transport cleanup complete');
		return Promise.resolve();
	}

	// Analytics mode methods
	private createAnalyticsSession(sessionId: string, isAuthenticated: boolean): void {
		const session: AnalyticsSession = {
			transport: null,
			server: null, // Server is null in analytics mode
			metadata: {
				id: sessionId,
				connectedAt: new Date(),
				lastActivity: new Date(),
				requestCount: 1,
				isAuthenticated,
				capabilities: {},
			},
		};

		this.analyticsSessions.set(sessionId, session);
		this.metrics.trackSessionCreated();

		logger.debug({ sessionId, isAuthenticated }, 'Analytics session created');
	}

	private updateAnalyticsSessionActivity(sessionId: string): void {
		const session = this.analyticsSessions.get(sessionId);
		if (session) {
			session.metadata.lastActivity = new Date();
			session.metadata.requestCount++;
		}
	}

	private updateAnalyticsSessionClientInfo(sessionId: string, clientInfo: { name: string; version: string }): void {
		const session = this.analyticsSessions.get(sessionId);
		if (session) {
			session.metadata.clientInfo = clientInfo;
		}
	}
}
