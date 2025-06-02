import { type Express } from 'express';
import { type TransportType } from '../shared/constants.js';
import type { TransportInfo } from '../shared/transport-info.js';
import { createTransport } from './transport/transport-factory.js';
import type { BaseTransport, ServerFactory } from './transport/base-transport.js';
import type { WebServer } from './web-server.js';
import { logger } from './lib/logger.js';
import { createServerFactory } from './mcp-server.js';
import { McpApiClient, type ApiClientConfig } from './lib/mcp-api-client.js';
import {
	SEMANTIC_SEARCH_TOOL_CONFIG,
	MODEL_SEARCH_TOOL_CONFIG,
	MODEL_DETAIL_TOOL_CONFIG,
	PAPER_SEARCH_TOOL_CONFIG,
	DATASET_SEARCH_TOOL_CONFIG,
	DATASET_DETAIL_TOOL_CONFIG,
	DUPLICATE_SPACE_TOOL_CONFIG,
} from '@hf-mcp/mcp';

export interface ApplicationOptions {
	transportType: TransportType;
	webAppPort: number;
	webServerInstance: WebServer;
	apiClientConfig?: ApiClientConfig; // Optional - defaults to polling mode
}

/**
 * Main application class that coordinates web server, MCP server factory, and transport lifecycle
 */
export class Application {
	private serverFactory: ServerFactory;
	private webServerInstance: WebServer;
	private appInstance: Express;
	private transport?: BaseTransport;
	private apiClient: McpApiClient;
	private transportType: TransportType;
	private webAppPort: number;
	private isDev: boolean;

	constructor(options: ApplicationOptions) {
		this.transportType = options.transportType;
		this.webAppPort = options.webAppPort;
		this.webServerInstance = options.webServerInstance;
		this.isDev = process.env.NODE_ENV === 'development';

		// Create transport info first
		const defaultHfToken = process.env.DEFAULT_HF_TOKEN;
		const transportInfo: TransportInfo = {
			transport: this.transportType,
			port: this.webAppPort,
			defaultHfTokenSet: !!defaultHfToken,
			hfTokenMasked: defaultHfToken ? maskToken(defaultHfToken) : undefined,
			jsonResponseEnabled: this.transportType === 'streamableHttpJson',
			stdioClient: this.transportType === 'stdio' ? null : undefined,
		};

		// Configure API client with transport info
		const apiClientConfig: ApiClientConfig = options.apiClientConfig || {
			type: 'polling',
			baseUrl: `http://localhost:${String(this.webAppPort)}`,
			pollInterval: 5000,
		};
		this.apiClient = new McpApiClient(apiClientConfig, transportInfo);

		// Create the server factory
		this.serverFactory = createServerFactory(this.webServerInstance, this.apiClient);

		// Get Express app instance
		this.appInstance = this.webServerInstance.getApp();
	}

	async start(): Promise<void> {
		// Set transport info (already created in constructor)
		const transportInfo = this.apiClient.getTransportInfo();
		if (transportInfo) {
			this.webServerInstance.setTransportInfo(transportInfo);
		}

		// Setup tool management for web server
		this.setupToolManagement();

		// Configure API endpoints
		this.webServerInstance.setupApiRoutes();

		// Initialize transport
		await this.initializeTransport();

		// Setup static files (must be after transport routes in dev mode)
		await this.webServerInstance.setupStaticFiles(this.isDev);

		// Start web server
		await this.startWebServer();

		// Start API client (global tool management)
		await this.startToolManagement();
	}

	private setupToolManagement(): void {
		// For web server tool management, create placeholder registered tools
		// In a full implementation, tool enable/disable would be managed differently
		const registeredTools: { [toolId: string]: { enable: () => void; disable: () => void } } = {};
		const toolNames = [
			SEMANTIC_SEARCH_TOOL_CONFIG.name,
			MODEL_SEARCH_TOOL_CONFIG.name,
			MODEL_DETAIL_TOOL_CONFIG.name,
			PAPER_SEARCH_TOOL_CONFIG.name,
			DATASET_SEARCH_TOOL_CONFIG.name,
			DATASET_DETAIL_TOOL_CONFIG.name,
			DUPLICATE_SPACE_TOOL_CONFIG.name,
		];

		// Create placeholder registered tools for web server compatibility
		toolNames.forEach((toolName) => {
			registeredTools[toolName] = {
				enable: () => {
					/* Tools are enabled by default in each server instance */
				},
				disable: () => {
					/* Tools would need to be disabled per-server if needed */
				},
			};
		});

		// Pass registered tools to WebServer
		this.webServerInstance.setRegisteredTools(registeredTools);
	}

	private async initializeTransport(): Promise<void> {
		if (this.transportType === 'unknown') return;

		try {
			this.transport = createTransport(this.transportType, this.serverFactory, this.appInstance);
			await this.transport.initialize({
				port: this.webAppPort,
			});
		} catch (error) {
			logger.error({ error }, `Error initializing ${this.transportType} transport`);
			throw error;
		}
	}

	private async startWebServer(): Promise<void> {
		// WebServer manages its own lifecycle
		await this.webServerInstance.start(this.webAppPort);
		logger.info(`Server running at http://localhost:${String(this.webAppPort)}`);
		logger.info(
			{ transportType: this.transportType, mode: this.isDev ? 'development with HMR' : 'production' },
			'Server configuration'
		);
		if (this.isDev) {
			logger.info('HMR is active - frontend changes will be automatically reflected in the browser');
			logger.info("For server changes, use 'npm run dev:watch' to automatically rebuild and apply changes");
		}
	}

	private async startToolManagement(): Promise<void> {
		// Start API client for global tool state management
		await this.apiClient.startPolling((toolId, enabled) => {
			logger.info(`Global tool ${toolId} ${enabled ? 'enabled' : 'disabled'}`);
			// Note: The actual tool enable/disable is handled per-server in the ServerFactory
		});
	}

	async stop(): Promise<void> {
		// Stop global API client
		this.apiClient.stopPolling();
		// Signal transport to stop accepting new connections
		if (this.transport?.shutdown) {
			this.transport.shutdown();
		}

		logger.info('Shutting down web server...');
		await this.webServerInstance.stop();

		// Clean up transport if initialized
		if (this.transport) {
			await this.transport.cleanup();
		}
	}

	getExpressApp(): Express {
		return this.appInstance;
	}
}

export function maskToken(token: string): string {
	if (!token || token.length <= 9) return token;
	return `${token.substring(0, 4)}...${token.substring(token.length - 5)}`;
}
