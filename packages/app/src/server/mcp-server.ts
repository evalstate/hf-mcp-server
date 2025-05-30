#!/usr/bin/env node

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { z } from 'zod';
import { logger } from './lib/logger.js';
import { createRequire } from 'module';

// Import the search services
import {
	SpaceSearchTool,
	formatSearchResults,
	SEMANTIC_SEARCH_TOOL_CONFIG,
	type SearchParams,
	ModelSearchTool,
	MODEL_SEARCH_TOOL_CONFIG,
	type ModelSearchParams,
	ModelDetailTool,
	MODEL_DETAIL_TOOL_CONFIG,
	type ModelDetailParams,
	PaperSearchTool,
	PAPER_SEARCH_TOOL_CONFIG,
	DatasetSearchTool,
	DATASET_SEARCH_TOOL_CONFIG,
	type DatasetSearchParams,
	DatasetDetailTool,
	DATASET_DETAIL_TOOL_CONFIG,
	type DatasetDetailParams,
} from '@hf-mcp/mcp';

import { settingsService, type ToolSettings } from '../shared/settings.js';

import { type TransportType, DEFAULT_WEB_APP_PORT } from '../shared/constants.js';

import { createTransport } from './transport/transport-factory.js';
import type { BaseTransport } from './transport/base-transport.js';
import type { Server } from 'net';

interface RegisteredTool {
	enable: () => void;
	disable: () => void;
	remove: () => void;
}

let activeTransport: TransportType = 'unknown';
let activePort: number | undefined = undefined;
let activeClientInfo: { name: string; version: string } | null = null;

const maskToken = (token: string): string => {
	if (!token || token.length <= 9) return token;
	return `${token.substring(0, 4)}...${token.substring(token.length - 5)}`;
};

const getHfToken = (): string | undefined => {
	return process.env.HF_TOKEN || process.env.HUGGING_FACE_TOKEN;
};

const app = express();
app.use(express.json());
let webServer: Server | null = null;
// Determine if we're in development mode
const isDev = process.env.NODE_ENV === 'development';

export const createServer = async (
	transportType: TransportType = 'unknown',
	webAppPort: number = DEFAULT_WEB_APP_PORT
): Promise<{ server: McpServer; cleanup: () => Promise<void>; app: express.Application }> => {
	const require = createRequire(import.meta.url);
	const { version } = require('../../package.json') as { version: string };

	const server = new McpServer(
		{
			name: '@huggingface/mcp-services',
			version: version,
		},
		{
			instructions:
				"This server provides tools for searching the Hugging Face Hub. arXiv paper id's are often " +
				'used as references between datasets, models and papers. There are over 100 tags in use, ' +
				"common tags include 'Text Generation', 'Transformers', 'Image Classification' and so on.",
			capabilities: {
				tools: { listChanged: true },
			},
		}
	);

	server.server.oninitialized = () => {
		const clientInfo = server.server.getClientVersion();
		logger.info(
			{ client: clientInfo },
			`Initialized ${clientInfo?.name || '<unknown>'} ${clientInfo?.version || '<unknown>'}`
		);
		
		// Store client info for STDIO connections
		if (transportType === 'stdio' && clientInfo) {
			activeClientInfo = {
				name: clientInfo.name || '<unknown>',
				version: clientInfo.version || '<unknown>'
			};
		}
	};

	activeTransport = transportType;
	activePort = webAppPort;

	// "Hugging Face Spaces" are known by Qwen2.5/3, Sonnet/Haiku and OpenAI Models
	const spaceSearchTool = server.tool(
		SEMANTIC_SEARCH_TOOL_CONFIG.name,
		SEMANTIC_SEARCH_TOOL_CONFIG.description,
		SEMANTIC_SEARCH_TOOL_CONFIG.schema.shape,
		SEMANTIC_SEARCH_TOOL_CONFIG.annotations,
		async (params: SearchParams) => {
			const hfToken = getHfToken();
			const semanticSearch = new SpaceSearchTool(hfToken);
			const results = await semanticSearch.search(params.query, params.limit, params.mcp);
			return {
				content: [{ type: 'text', text: formatSearchResults(params.query, results) }],
			};
		}
	);

	const modelSearchTool = server.tool(
		MODEL_SEARCH_TOOL_CONFIG.name,
		MODEL_SEARCH_TOOL_CONFIG.description,
		MODEL_SEARCH_TOOL_CONFIG.schema.shape,
		MODEL_SEARCH_TOOL_CONFIG.annotations,
		async (params: ModelSearchParams) => {
			const hfToken = getHfToken();
			const modelSearch = new ModelSearchTool(hfToken, undefined);
			const results = await modelSearch.searchWithParams(params);

			return {
				content: [{ type: 'text', text: results }],
			};
		}
	);

	const modelDetailTool = server.tool(
		MODEL_DETAIL_TOOL_CONFIG.name,
		MODEL_DETAIL_TOOL_CONFIG.description,
		MODEL_DETAIL_TOOL_CONFIG.schema.shape,
		MODEL_DETAIL_TOOL_CONFIG.annotations,
		async (params: ModelDetailParams) => {
			const hfToken = getHfToken();
			const modelDetail = new ModelDetailTool(hfToken, undefined);
			const results = await modelDetail.getDetails(params.model_id);

			return {
				content: [{ type: 'text', text: results }],
			};
		}
	);

	/** NB Claude models are extremely sensitive to tool descriptions/length  */
	const paperSearchTool = server.tool(
		PAPER_SEARCH_TOOL_CONFIG.name,
		PAPER_SEARCH_TOOL_CONFIG.description,
		PAPER_SEARCH_TOOL_CONFIG.schema.shape,
		PAPER_SEARCH_TOOL_CONFIG.annotations,
		async (params: z.infer<typeof PAPER_SEARCH_TOOL_CONFIG.schema>) => {
			const hfToken = getHfToken();
			const results = await new PaperSearchTool(hfToken).search(params.query, params.limit);
			return {
				content: [{ type: 'text', text: results }],
			};
		}
	);

	const datasetSearchTool = server.tool(
		DATASET_SEARCH_TOOL_CONFIG.name,
		DATASET_SEARCH_TOOL_CONFIG.description,
		DATASET_SEARCH_TOOL_CONFIG.schema.shape,
		DATASET_SEARCH_TOOL_CONFIG.annotations,
		async (params: DatasetSearchParams) => {
			const hfToken = getHfToken();
			const datasetSearch = new DatasetSearchTool(hfToken, undefined);
			const results = await datasetSearch.searchWithParams(params);

			return {
				content: [{ type: 'text', text: results }],
			};
		}
	);

	const datasetDetailTool = server.tool(
		DATASET_DETAIL_TOOL_CONFIG.name,
		DATASET_DETAIL_TOOL_CONFIG.description,
		DATASET_DETAIL_TOOL_CONFIG.schema.shape,
		DATASET_DETAIL_TOOL_CONFIG.annotations,
		async (params: DatasetDetailParams) => {
			const hfToken = getHfToken();
			const datasetDetail = new DatasetDetailTool(hfToken, undefined);
			const results = await datasetDetail.getDetails(params.dataset_id);

			return {
				content: [{ type: 'text', text: results }],
			};
		}
	);

	const registeredTools: { [toolId: string]: RegisteredTool } = {
		[SEMANTIC_SEARCH_TOOL_CONFIG.name]: spaceSearchTool,
		[MODEL_SEARCH_TOOL_CONFIG.name]: modelSearchTool,
		[MODEL_DETAIL_TOOL_CONFIG.name]: modelDetailTool,
		[PAPER_SEARCH_TOOL_CONFIG.name]: paperSearchTool,
		[DATASET_SEARCH_TOOL_CONFIG.name]: datasetSearchTool,
		[DATASET_DETAIL_TOOL_CONFIG.name]: datasetDetailTool,
	};

	// Initialize tool state based on settings
	const initialSettings = settingsService.getSettings();
	for (const [toolId, toolSettings] of Object.entries(initialSettings.tools)) {
		if (registeredTools[toolId]) {
			if (toolSettings.enabled) {
				registeredTools[toolId].enable();
				logger.info(`Tool ${toolId} initialized as enabled`);
			} else {
				registeredTools[toolId].disable();
				logger.info(`Tool ${toolId} initialized as disabled`);
			}
		}
	}

	// Get the file paths
	const __filename = fileURLToPath(import.meta.url);
	const __dirname = path.dirname(__filename);

	// Define the root directory (important for Vite to find the right files)
	// In dev mode, we need to point to the source directory, not the dist directory
	const rootDir = isDev
		? path.resolve(__dirname, '..', '..', '..', 'app', 'src', 'web') // Go up from dist/server to app/src/web
		: path.resolve(__dirname, '..', 'web'); // In prod, static files are in dist/web

	// In production, the static files are in the same directory as the server code
	// Configure API endpoints first (these need to be available in both dev and prod)
	app.get('/api/transport', (req, res) => {
		const hfToken = getHfToken();

		// Define the type for transport info with all possible properties
		interface TransportInfoResponse {
			transport: TransportType;
			hfTokenSet: boolean;
			hfTokenMasked?: string;
			port?: number;
			jsonResponseEnabled?: boolean;
			stdioClient?: {
				name: string;
				version: string;
			} | null;
		}

		const transportInfo: TransportInfoResponse = {
			transport: activeTransport,
			hfTokenSet: !!hfToken,
		};

		if (hfToken) {
			transportInfo.hfTokenMasked = maskToken(hfToken);
		}

		// Set port information for all transports (web app always runs on this port)
		if (activePort) {
			transportInfo.port = activePort;
		}

		// Add JSON response mode info for streamableHttpJson transport type
		if (activeTransport === 'streamableHttpJson') {
			transportInfo.jsonResponseEnabled = true;
		}

		// Add STDIO client info
		if (activeTransport === 'stdio') {
			transportInfo.stdioClient = activeClientInfo;
		}

		res.json(transportInfo);
	});

	// API endpoint to get settings
	app.get('/api/settings', (req, res) => {
		res.json(settingsService.getSettings());
	});

	// API endpoint to update tool settings
	app.post('/api/settings/tools/:toolId', express.json(), (req, res) => {
		const { toolId } = req.params;
		const settings = req.body as Partial<ToolSettings>;
		const updatedSettings = settingsService.updateToolSettings(toolId, settings);

		// Enable or disable the actual MCP tool if it exists
		if (registeredTools[toolId]) {
			if (settings.enabled) {
				registeredTools[toolId].enable();
				logger.info(`Tool ${toolId} has been enabled via API`);
			} else {
				registeredTools[toolId].disable();
				logger.info(`Tool ${toolId} has been disabled via API`);
			}
		}

		res.json(updatedSettings);
	});

	// Initialize transport based on the transport type
	let transport: BaseTransport | undefined;
	if (transportType !== 'unknown') {
		try {
			transport = createTransport(transportType, server, app);
			await transport.initialize({
				port: webAppPort,
			});
		} catch (error) {
			logger.error({ error }, `Error initializing ${transportType} transport`);
		}
	}

	// Handle static file serving and SPA navigation based on mode
	if (isDev) {
		// In development mode, use Vite's dev server middleware
		try {
			const { createServer: createViteServer } = await import('vite');

			// Create Vite server with proper HMR configuration - load config from default location
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
			app.use(vite.middlewares);

			logger.info('Using Vite middleware in development mode with HMR enabled');
			logger.info({ rootDir }, 'Vite root directory');
		} catch (err) {
			logger.error({ err }, 'Error setting up Vite middleware');
			process.exit(1);
		}
	} else {
		// In production mode, serve static files from dist directory
		const distPath = rootDir;
		app.use(express.static(distPath));

		// For any other route in production, serve the index.html file (for SPA navigation)
		app.get('*', (req, res) => {
			res.sendFile(path.join(distPath, 'index.html'));
		});
	}

	const startWebServer = () => {
		if (!webServer) {
			webServer = app.listen(webAppPort, () => {
				logger.info(`Server running at http://localhost:${webAppPort.toString()}`);
				logger.info({ transportType, mode: isDev ? 'development with HMR' : 'production' }, 'Server configuration');
				if (isDev) {
					logger.info('HMR is active - frontend changes will be automatically reflected in the browser');
					logger.info("For server changes, use 'npm run dev:watch' to automatically rebuild and apply changes");
				}
			});
		}
	};

	const cleanup = async () => {
		if (webServer) {
			logger.info('Shutting down web server...');
			// improve mcp server & express shutdown handling
		}

		// Clean up transport if initialized
		if (transport) {
			await transport.cleanup();
		}
		
		// Clear client info on cleanup for STDIO
		if (transportType === 'stdio') {
			activeClientInfo = null;
		}
	};

	startWebServer();
	return { server, cleanup, app };
};
