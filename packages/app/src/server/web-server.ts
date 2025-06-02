import express, { type Express } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Server } from 'node:http';
import type { TransportInfo } from '../shared/transport-info.js';
import type { ToolSettings } from '../shared/settings.js';
import { settingsService } from '../shared/settings.js';
import { logger } from './lib/logger.js';
import type { BaseTransport } from './transport/base-transport.js';

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

		// Settings endpoint
		this.app.get('/api/settings', (_req, res) => {
			res.json(settingsService.getSettings());
		});

		// Update tool settings endpoint
		this.app.post('/api/settings/tools/:toolId', express.json(), (req, res) => {
			const { toolId } = req.params;
			const settings = req.body as Partial<ToolSettings>;
			const updatedSettings = settingsService.updateToolSettings(toolId, settings);

			// Enable or disable the actual MCP tool if it exists
			if (this.registeredTools[toolId]) {
				if (settings.enabled) {
					this.registeredTools[toolId].enable();
					logger.info(`Tool ${toolId} has been enabled via API`);
				} else {
					this.registeredTools[toolId].disable();
					logger.info(`Tool ${toolId} has been disabled via API`);
				}
			}

			res.json(updatedSettings);
		});
	}
}
