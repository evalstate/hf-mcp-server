#!/usr/bin/env node

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { z } from 'zod';

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
import { type TransportOptions } from './transport/base-transport.js';
import type { Server } from 'net';
import { InitializeRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { request } from 'http';

interface RegisteredTool {
	enable: () => void;
	disable: () => void;
	remove: () => void;
}

let activeTransport: TransportType = 'unknown';
let activePort: number | undefined = undefined;

const maskToken = (token: string): string => {
	if (!token || token.length <= 9) return token;
	return `${token.substring(0, 4)}...${token.substring(token.length - 5)}`;
};

const getHfToken = (): string | undefined => {
	return process.env.HF_TOKEN || process.env.HUGGING_FACE_TOKEN;
};

const app = express();
let webServer: Server | null = null;
// Determine if we're in development mode
const isDev = process.env.NODE_ENV === 'development';

export const createServer = async (
	transportType: TransportType = 'unknown',
	webAppPort: number = DEFAULT_WEB_APP_PORT,
	transportOptions: TransportOptions = {}
): Promise<{ server: McpServer; cleanup: () => Promise<void>; app: express.Application }> => {
	const server = new McpServer(
		{
			name: 'hf-mcp-server',
			version: '0.1.1',
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
		console.error(
			`${new Date().toISOString()} : Initialized ${server.server.getClientVersion()?.name || '<unknown>'} ${server.server.getClientVersion()?.version || '<unknown>'}`
		);
	};

	activeTransport = transportType;

	if (transportType === 'sse' || transportType === 'streamableHttp' || transportType === 'streamableHttpJson') {
		activePort = webAppPort;
	}

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
				console.log(`Tool ${toolId} initialized as enabled`);
			} else {
				registeredTools[toolId].disable();
				console.log(`Tool ${toolId} initialized as disabled`);
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
		}

		const transportInfo: TransportInfoResponse = {
			transport: activeTransport,
			hfTokenSet: !!hfToken,
		};

		if (hfToken) {
			transportInfo.hfTokenMasked = maskToken(hfToken);
		}

		// Set port information for all HTTP transports
		if (
			activePort &&
			(activeTransport === 'sse' || activeTransport === 'streamableHttp' || activeTransport === 'streamableHttpJson')
		) {
			transportInfo.port = activePort;
		}

		// Add JSON response mode info for both JSON transport type and streamableHttp with JSON enabled
		if (
			activeTransport === 'streamableHttpJson' ||
			(activeTransport === 'streamableHttp' && transportOptions.enableJsonResponse === true)
		) {
			transportInfo.jsonResponseEnabled = true;
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
		const updatedSettings = settingsService.updateToolSettings(toolId, req.body as Partial<ToolSettings>);

		// Enable or disable the actual MCP tool if it exists
		if (registeredTools[toolId]) {
			if (req.body.enabled) {
				registeredTools[toolId].enable();
				console.log(`Tool ${toolId} has been enabled via API`);
			} else {
				registeredTools[toolId].disable();
				console.log(`Tool ${toolId} has been disabled via API`);
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
				...transportOptions,
			});
		} catch (error) {
			console.error(`Error initializing ${transportType} transport:`, error);
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

			console.log('Using Vite middleware in development mode with HMR enabled');
			console.log(`Vite root directory: ${rootDir}`);
		} catch (err) {
			console.error('Error setting up Vite middleware:', err);
			console.error(err);
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
				console.log(`Server running at http://localhost:${webAppPort}`);
				console.log(`Transport type: ${transportType}`);
				console.log(`Mode: ${isDev ? 'development with HMR' : 'production'}`);
				if (isDev) {
					console.log(`HMR is active - frontend changes will be automatically reflected in the browser`);
					console.log(`For server changes, use 'npm run dev:watch' to automatically rebuild and apply changes`);
				}
			});
		}
	};

	const cleanup = async () => {
		if (webServer) {
			console.log('Shutting down web server...');
			// improve mcp server & express shutdown handling
		}

		// Clean up transport if initialized
		if (transport) {
			await transport.cleanup();
		}
	};

	startWebServer();
	return { server, cleanup, app };
};
