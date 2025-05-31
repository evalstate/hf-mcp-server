#!/usr/bin/env node

import { type Express } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { z } from 'zod';
import { logger } from './lib/logger.js';
import { createRequire } from 'module';
import type { WebServer } from './web-server.js';
import { McpApiClient } from './lib/mcp-api-client.js';

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


import { type TransportType, DEFAULT_WEB_APP_PORT } from '../shared/constants.js';

import { createTransport } from './transport/transport-factory.js';
import type { BaseTransport } from './transport/base-transport.js';

interface RegisteredTool {
	enable: () => void;
	disable: () => void;
	remove: () => void;
}

// Utility functions
const getHfToken = (): string | undefined => {
	return process.env.HF_TOKEN || process.env.HUGGING_FACE_TOKEN;
};

// Determine if we're in development mode
const isDev = process.env.NODE_ENV === 'development';

export const createServer = async (
	transportType: TransportType = 'unknown',
	webAppPort: number = DEFAULT_WEB_APP_PORT,
	webServerInstance: WebServer
): Promise<{ server: McpServer; cleanup: () => Promise<void>; app: Express }> => {
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

	// Use provided WebServer instance
	const appInstance: Express = webServerInstance.getApp();

	server.server.oninitialized = () => {
		const clientInfo = server.server.getClientVersion();
		logger.info(
			{ client: clientInfo },
			`Initialized ${clientInfo?.name || '<unknown>'} ${clientInfo?.version || '<unknown>'}`
		);
		
		// Store client info for STDIO connections
		if (transportType === 'stdio' && clientInfo) {
			const clientData = {
				name: clientInfo.name || '<unknown>',
				version: clientInfo.version || '<unknown>'
			};
			
			webServerInstance.setClientInfo(clientData);
		}
	};

	// Set transport info
	webServerInstance.setTransportInfo(transportType, webAppPort);

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

	// Pass registered tools to WebServer
	webServerInstance.setRegisteredTools(registeredTools);

	// Create API client (but don't start polling yet)
	const apiUrl = `http://localhost:${String(webAppPort)}`;
	const apiClient = new McpApiClient(apiUrl, 5000); // 5 second polling interval

	// Configure API endpoints
	webServerInstance.setupApiRoutes();

	// WebServer handles static files
	await webServerInstance.setupStaticFiles(isDev);

	// Initialize transport AFTER static files setup but BEFORE server starts
	let transport: BaseTransport | undefined;
	if (transportType !== 'unknown') {
		try {
			transport = createTransport(transportType, server, appInstance);
			await transport.initialize({
				port: webAppPort,
			});
		} catch (error) {
			logger.error({ error }, `Error initializing ${transportType} transport`);
		}
	}

	const startWebServer = async () => {
		// WebServer manages its own lifecycle
		await webServerInstance.start(webAppPort);
		logger.info(`Server running at http://localhost:${String(webAppPort)}`);
		logger.info({ transportType, mode: isDev ? 'development with HMR' : 'production' }, 'Server configuration');
		if (isDev) {
			logger.info('HMR is active - frontend changes will be automatically reflected in the browser');
			logger.info("For server changes, use 'npm run dev:watch' to automatically rebuild and apply changes");
		}
	};

	const cleanup = async () => {
		// Stop API polling
		apiClient.destroy();

		logger.info('Shutting down web server...');
		await webServerInstance.stop();

		// Clean up transport if initialized
		if (transport) {
			await transport.cleanup();
		}
	};

	await startWebServer();

	// Start polling for tool state changes after web server is running
	await apiClient.startPolling((toolId, enabled) => {
		if (registeredTools[toolId]) {
			if (enabled) {
				registeredTools[toolId].enable();
				logger.info(`Tool ${toolId} enabled via API polling`);
			} else {
				registeredTools[toolId].disable();
				logger.info(`Tool ${toolId} disabled via API polling`);
			}
		}
	});

	return { server, cleanup, app: appInstance };
};
