import express, { type Express } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Server } from 'node:http';
import type { TransportInfo } from '../shared/transport-info.js';
import { settingsService } from '../shared/settings.js';
import { logger } from './lib/logger.js';
import type { BaseTransport } from './transport/base-transport.js';
import type { McpApiClient } from './lib/mcp-api-client.js';
import { formatMetricsForAPI } from '../shared/transport-metrics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface RegisteredTool {
	enable: () => void;
	disable: () => void;
}

export class WebServer {
	private app: Express;
	private server: Server | null = null;
	private transportInfo: TransportInfo = {
		transport: 'unknown',
		defaultHfTokenSet: false,
		stdioClient: null,
	};
	private registeredTools: { [toolId: string]: RegisteredTool } = {};
	private transport?: BaseTransport;
	private apiClient?: McpApiClient;

	constructor() {
		this.app = express() as Express;
		this.setupMiddleware();
	}

	private setupMiddleware(): void {
		this.app.use(express.json());
	}

	public getApp(): Express {
		return this.app;
	}

	public setTransportInfo(info: TransportInfo): void {
		this.transportInfo = info;
	}

	public setClientInfo(clientInfo: { name: string; version: string } | null): void {
		this.transportInfo.stdioClient = clientInfo;
	}

	public setRegisteredTools(tools: { [toolId: string]: RegisteredTool }): void {
		this.registeredTools = tools;
	}

	public setTransport(transport: BaseTransport): void {
		this.transport = transport;
	}

	public setApiClient(apiClient: McpApiClient): void {
		this.apiClient = apiClient;
	}

	public getTransportInfo(): TransportInfo {
		return this.transportInfo;
	}

	public async start(port: number): Promise<void> {
		if (this.server) {
			throw new Error('Server is already running');
		}

		return new Promise((resolve, reject) => {
			this.server = this.app
				.listen(port, () => {
					this.transportInfo.port = port;
					resolve();
				})
				.on('error', reject);
		});
	}

	public async stop(): Promise<void> {
		if (!this.server) {
			return;
		}

		return new Promise((resolve, reject) => {
			this.server?.close((err) => {
				if (err) {
					reject(err);
				} else {
					this.server = null;
					resolve();
				}
			});
		});
	}

	public async setupStaticFiles(isDevelopment: boolean): Promise<void> {
		if (isDevelopment) {
			// In development mode, use Vite's dev server middleware
			try {
				const { createServer: createViteServer } = await import('vite');
				const rootDir = path.resolve(__dirname, '..', '..', '..', 'app', 'src', 'web');

				// Create Vite server with proper HMR configuration
				const vite = await createViteServer({
					configFile: path.resolve(__dirname, '..', '..', '..', 'app', 'vite.config.ts'),
					server: {
						middlewareMode: true,
						hmr: true, // Explicitly enable HMR
					},
					appType: 'spa',
					root: rootDir,
				});

				// Use Vite's middleware for dev server with HMR
				this.app.use(vite.middlewares);

				logger.info('Using Vite middleware in development mode with HMR enabled');
				logger.info({ rootDir }, 'Vite root directory');
			} catch (err) {
				logger.error({ err }, 'Error setting up Vite middleware');
				throw err;
			}
		} else {
			// In production, serve static files
			const staticPath = path.join(__dirname, '..', 'web');
			this.app.use(express.static(staticPath));

			// Fallback to index.html for SPA routing
			this.app.get('*', (req, res) => {
				if (!req.path.startsWith('/api/')) {
					res.sendFile(path.join(staticPath, 'index.html'));
				}
			});
		}
	}

	public setupApiRoutes(): void {
		// Transport info endpoint
		this.app.get('/api/transport', (_req, res) => {
			res.json(this.transportInfo);
		});

		// Sessions endpoint
		this.app.get('/api/sessions', (_req, res) => {
			if (!this.transport) {
				res.json([]);
				return;
			}
			
			const sessions = this.transport.getSessions();
			
			// For STDIO transport, also update the stdioClient info if we have a session
			if (this.transportInfo.transport === 'stdio' && sessions.length > 0) {
				const stdioSession = sessions[0];
				if (stdioSession?.clientInfo && !this.transportInfo.stdioClient) {
					this.transportInfo.stdioClient = {
						name: stdioSession.clientInfo.name,
						version: stdioSession.clientInfo.version,
					};
				}
			}
			
			res.json(sessions);
		});

		// Transport metrics endpoint
		this.app.get('/api/transport-metrics', (_req, res) => {
			if (!this.transport) {
				res.status(503).json({ error: 'Transport not initialized' });
				return;
			}

			try {
				// Get raw metrics from transport
				const metrics = this.transport.getMetrics();
				
				// Determine if transport is stateless
				const isStateless = this.transportInfo.transport === 'streamableHttpJson';
				
				// Get configuration for stateful transports
				const config = this.transport.getConfiguration();
				
				// Format for API response
				const formattedMetrics = formatMetricsForAPI(
					metrics,
					this.transportInfo.transport,
					isStateless
				);

				// Add configuration if available
				if (!isStateless && config.staleCheckInterval && config.staleTimeout) {
					formattedMetrics.configuration = {
						staleCheckInterval: config.staleCheckInterval,
						staleTimeout: config.staleTimeout
					};
				}

				res.json(formattedMetrics);
			} catch (error) {
				logger.error({ error }, 'Error retrieving transport metrics');
				res.status(500).json({ error: 'Failed to retrieve transport metrics' });
			}
		});

		// Settings endpoint
		this.app.get('/api/settings', (_req, res) => {
			res.json(settingsService.getSettings());
		});

		// Update tool settings endpoint
		this.app.post('/api/settings', express.json(), (req, res) => {
			const { builtInTools } = req.body as { builtInTools: string[] };
			const updatedSettings = settingsService.updateBuiltInTools(builtInTools);

			// Enable or disable the actual MCP tools based on the new list
			for (const [toolId, tool] of Object.entries(this.registeredTools)) {
				if (builtInTools.includes(toolId)) {
					tool.enable();
					logger.info(`Tool ${toolId} has been enabled via API`);
				} else {
					tool.disable();
					logger.info(`Tool ${toolId} has been disabled via API`);
				}
			}

			res.json(updatedSettings);
		});

		// Gradio endpoints endpoint
		this.app.get('/api/gradio-endpoints', (_req, res) => {
			if (!this.apiClient) {
				res.json([]);
				return;
			}
			res.json(this.apiClient.getGradioEndpoints());
		});

		// Update Gradio endpoint status
		this.app.post('/api/gradio-endpoints/:index', express.json(), (req, res) => {
			const index = parseInt(req.params.index);
			const { enabled } = req.body as { enabled: boolean };
			
			if (!this.apiClient) {
				res.status(500).json({ error: 'API client not initialized' });
				return;
			}

			const endpoints = this.apiClient.getGradioEndpoints();
			if (index < 0 || index >= endpoints.length) {
				res.status(404).json({ error: 'Endpoint not found' });
				return;
			}

			// Update the state in the API client
			this.apiClient.updateGradioEndpointState(index, enabled);
			
			// Get the updated endpoint
			const updatedEndpoints = this.apiClient.getGradioEndpoints();
			const updatedEndpoint = updatedEndpoints[index];
			
			res.json(updatedEndpoint);
		});

		// Update Gradio endpoint URL
		this.app.put('/api/gradio-endpoints/:index', express.json(), (req, res) => {
			const index = parseInt(req.params.index);
			const { url } = req.body as { url: string };
			
			if (!this.apiClient) {
				res.status(500).json({ error: 'API client not initialized' });
				return;
			}

			const endpoints = this.apiClient.getGradioEndpoints();
			if (index < 0 || index >= endpoints.length) {
				res.status(404).json({ error: 'Endpoint not found' });
				return;
			}

			// Validate URL
			try {
				new URL(url);
			} catch {
				res.status(400).json({ error: 'Invalid URL format' });
				return;
			}

			// Update the URL in the API client
			this.apiClient.updateGradioEndpointUrl(index, url);
			
			// Get the updated endpoint
			const updatedEndpoints = this.apiClient.getGradioEndpoints();
			const updatedEndpoint = updatedEndpoints[index];
			
			res.json(updatedEndpoint);
		});
	}
}
