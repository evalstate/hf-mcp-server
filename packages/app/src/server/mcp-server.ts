import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { z } from 'zod';
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

import type { ServerFactory } from './transport/base-transport.js';
import type { McpApiClient } from './lib/mcp-api-client.js';
import type { WebServer } from './web-server.js';
import { logger } from './lib/logger.js';

// Utility functions
const getHfToken = (): string | undefined => {
	return process.env.HF_TOKEN || process.env.HUGGING_FACE_TOKEN;
};

/**
 * Creates a ServerFactory function that produces McpServer instances with all tools registered
 * The shared ApiClient provides global tool state management across all server instances
 */
export const createServerFactory = (webServerInstance: WebServer, _sharedApiClient: McpApiClient): ServerFactory => {
	const require = createRequire(import.meta.url);
	const { version } = require('../../package.json') as { version: string };

	return (headers: Record<string, string> | null): McpServer => {
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

		// Set up client info capture and STDIO handling
		server.server.oninitialized = () => {
			const clientInfo = server.server.getClientVersion();
			logger.info(
				{ client: clientInfo },
				`Initialized ${clientInfo?.name || '<unknown>'} ${clientInfo?.version || '<unknown>'}`
			);

			// Store client info for STDIO connections (no headers means STDIO)
			if (!headers && clientInfo) {
				const clientData = {
					name: clientInfo.name || '<unknown>',
					version: clientInfo.version || '<unknown>',
				};
				webServerInstance.setClientInfo(clientData);
			}

			// Tool state management is now handled globally at the Application level
		};

		// For now, register all tools as enabled
		// TODO: In a future version, implement dynamic tool enable/disable based on shared state
		// This would require either:
		// 1. Polling the shared state during tool execution, or
		// 2. Implementing a tool registry that can be modified at runtime

		// Register all tools on this server instance
		const hfToken = getHfToken();

		server.tool(
			SEMANTIC_SEARCH_TOOL_CONFIG.name,
			SEMANTIC_SEARCH_TOOL_CONFIG.description,
			SEMANTIC_SEARCH_TOOL_CONFIG.schema.shape,
			SEMANTIC_SEARCH_TOOL_CONFIG.annotations,
			async (params: SearchParams) => {
				const semanticSearch = new SpaceSearchTool(hfToken);
				const results = await semanticSearch.search(params.query, params.limit, params.mcp);
				return {
					content: [{ type: 'text', text: formatSearchResults(params.query, results) }],
				};
			}
		);

		server.tool(
			MODEL_SEARCH_TOOL_CONFIG.name,
			MODEL_SEARCH_TOOL_CONFIG.description,
			MODEL_SEARCH_TOOL_CONFIG.schema.shape,
			MODEL_SEARCH_TOOL_CONFIG.annotations,
			async (params: ModelSearchParams) => {
				const modelSearch = new ModelSearchTool(hfToken, undefined);
				const results = await modelSearch.searchWithParams(params);
				return {
					content: [{ type: 'text', text: results }],
				};
			}
		);

		server.tool(
			MODEL_DETAIL_TOOL_CONFIG.name,
			MODEL_DETAIL_TOOL_CONFIG.description,
			MODEL_DETAIL_TOOL_CONFIG.schema.shape,
			MODEL_DETAIL_TOOL_CONFIG.annotations,
			async (params: ModelDetailParams) => {
				const modelDetail = new ModelDetailTool(hfToken, undefined);
				const results = await modelDetail.getDetails(params.model_id);
				return {
					content: [{ type: 'text', text: results }],
				};
			}
		);

		server.tool(
			PAPER_SEARCH_TOOL_CONFIG.name,
			PAPER_SEARCH_TOOL_CONFIG.description,
			PAPER_SEARCH_TOOL_CONFIG.schema.shape,
			PAPER_SEARCH_TOOL_CONFIG.annotations,
			async (params: z.infer<typeof PAPER_SEARCH_TOOL_CONFIG.schema>) => {
				const results = await new PaperSearchTool(hfToken).search(params.query, params.limit);
				return {
					content: [{ type: 'text', text: results }],
				};
			}
		);

		server.tool(
			DATASET_SEARCH_TOOL_CONFIG.name,
			DATASET_SEARCH_TOOL_CONFIG.description,
			DATASET_SEARCH_TOOL_CONFIG.schema.shape,
			DATASET_SEARCH_TOOL_CONFIG.annotations,
			async (params: DatasetSearchParams) => {
				const datasetSearch = new DatasetSearchTool(hfToken, undefined);
				const results = await datasetSearch.searchWithParams(params);
				return {
					content: [{ type: 'text', text: results }],
				};
			}
		);

		server.tool(
			DATASET_DETAIL_TOOL_CONFIG.name,
			DATASET_DETAIL_TOOL_CONFIG.description,
			DATASET_DETAIL_TOOL_CONFIG.schema.shape,
			DATASET_DETAIL_TOOL_CONFIG.annotations,
			async (params: DatasetDetailParams) => {
				const datasetDetail = new DatasetDetailTool(hfToken, undefined);
				const results = await datasetDetail.getDetails(params.dataset_id);
				return {
					content: [{ type: 'text', text: results }],
				};
			}
		);

		return server;
	};
};
