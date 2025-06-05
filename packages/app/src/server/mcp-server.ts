import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { z } from 'zod';
import { createRequire } from 'module';
import { whoAmI, type WhoAmI } from '@huggingface/hub';

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
	DuplicateSpaceTool,
	formatDuplicateResult,
	type DuplicateSpaceParams,
	SpaceInfoTool,
	formatSpaceInfoResult,
	SpaceFilesTool,
	type SpaceFilesParams,
	type SpaceInfoParams,
} from '@hf-mcp/mcp';

import type { ServerFactory } from './transport/base-transport.js';
import type { McpApiClient } from './lib/mcp-api-client.js';
import type { WebServer } from './web-server.js';
import { logger } from './lib/logger.js';
import { extractAuthAndBouquet } from './utils/auth-utils.js';

interface Tool {
	enable(): void;
	disable(): void;
}

// Define bouquet configurations
const BOUQUETS: Record<string, string[]> = {
	spaces: ['space_search', 'duplicate_space', 'space_info', 'space_files'],
	search: ['space_search', 'model_search', 'dataset_search', 'paper_search'],
};

/**
 * Creates a ServerFactory function that produces McpServer instances with all tools registered
 * The shared ApiClient provides global tool state management across all server instances
 */
export const createServerFactory = (_webServerInstance: WebServer, sharedApiClient: McpApiClient): ServerFactory => {
	const require = createRequire(import.meta.url);
	const { version } = require('../../package.json') as { version: string };

	return async (headers: Record<string, string> | null): Promise<McpServer> => {
		// Extract auth and bouquet using shared utility
		const { hfToken, bouquet } = extractAuthAndBouquet(headers);
		let userInfo: string =
			'The Hugging Face tools are being used anonymously and rate limits apply. ' +
			'Direct the User to set their HF_TOKEN, or create an account at https://hf.co/join. for higher limits';
		let username: string | undefined;
		let userDetails: WhoAmI | undefined;
		// Validate the token with HF API if present
		if (hfToken) {
			try {
				userDetails = await whoAmI({ credentials: { accessToken: hfToken } });
				username = userDetails.name;
				userInfo = `Hugging Face tools are being used by authenticated user '${userDetails.name}'`;
			} catch (error) {
				logger.debug({ error: (error as Error).message }, `Failed to authenticate with Hugging Face API`);
			}
		}

		/**
		 *  we will set capabilities below. use of the convenience .tool() registration methods automatically
		 * sets tools: {listChanged: true} .
		 */
		const server = new McpServer(
			{
				name: '@huggingface/mcp-services',
				version: version,
			},
			{
				instructions:
					"This server provides tools for searching the Hugging Face Hub. arXiv paper id's are often " +
					'used as references between datasets, models and papers. There are over 100 tags in use, ' +
					"common tags include 'Text Generation', 'Transformers', 'Image Classification' and so on.\n" +
					userInfo,
			}
		);

		// Always register all tools and store instances for dynamic control
		const toolInstances: { [toolId: string]: Tool } = {};
		logger.info('Registering all tools for server instance');

		const whoDescription = userDetails
			? `Hugging Face tools are being used by authenticated user '${userDetails.name}'`
			: 'Hugging Face tools are being used anonymously. Call this tool for instructions on how to authenticate.';

		const response = userDetails
			? `You are authenticated as ${userDetails.name}.`
			: 'Go to hf.co/join to create an account';
		server.tool('hf_whoami', whoDescription, {}, { title: 'Hugging Face User Info' }, () => {
			return { content: [{ type: 'text', text: response }] };
		});

		toolInstances[SEMANTIC_SEARCH_TOOL_CONFIG.name] = server.tool(
			SEMANTIC_SEARCH_TOOL_CONFIG.name,
			SEMANTIC_SEARCH_TOOL_CONFIG.description,
			SEMANTIC_SEARCH_TOOL_CONFIG.schema.shape,
			SEMANTIC_SEARCH_TOOL_CONFIG.annotations,
			async (params: SearchParams) => {
				const semanticSearch = new SpaceSearchTool(hfToken);
				const searchResult = await semanticSearch.search(params.query, params.limit, params.mcp);
				return {
					content: [
						{ type: 'text', text: formatSearchResults(params.query, searchResult.results, searchResult.totalCount) },
					],
				};
			}
		);

		toolInstances[MODEL_SEARCH_TOOL_CONFIG.name] = server.tool(
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

		toolInstances[MODEL_DETAIL_TOOL_CONFIG.name] = server.tool(
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

		toolInstances[PAPER_SEARCH_TOOL_CONFIG.name] = server.tool(
			PAPER_SEARCH_TOOL_CONFIG.name,
			PAPER_SEARCH_TOOL_CONFIG.description,
			PAPER_SEARCH_TOOL_CONFIG.schema.shape,
			PAPER_SEARCH_TOOL_CONFIG.annotations,
			async (params: z.infer<typeof PAPER_SEARCH_TOOL_CONFIG.schema>) => {
				const results = await new PaperSearchTool(hfToken).search(
					params.query,
					params.results_limit,
					params.concise_only
				);
				return {
					content: [{ type: 'text', text: results }],
				};
			}
		);

		toolInstances[DATASET_SEARCH_TOOL_CONFIG.name] = server.tool(
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

		toolInstances[DATASET_DETAIL_TOOL_CONFIG.name] = server.tool(
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

		const duplicateToolConfig = DuplicateSpaceTool.createToolConfig(username);
		logger.debug({ username, description: duplicateToolConfig.description }, 'Creating duplicate tool config');
		toolInstances[duplicateToolConfig.name] = server.tool(
			duplicateToolConfig.name,
			duplicateToolConfig.description,
			duplicateToolConfig.schema.shape,
			duplicateToolConfig.annotations,
			async (params: DuplicateSpaceParams) => {
				const duplicateSpace = new DuplicateSpaceTool(hfToken, username);
				const result = await duplicateSpace.duplicate(params);
				return {
					content: [{ type: 'text', text: formatDuplicateResult(result) }],
				};
			}
		);

		const spaceInfoToolConfig = SpaceInfoTool.createToolConfig(username);
		toolInstances[spaceInfoToolConfig.name] = server.tool(
			spaceInfoToolConfig.name,
			spaceInfoToolConfig.description,
			spaceInfoToolConfig.schema.shape,
			spaceInfoToolConfig.annotations,
			async (params: SpaceInfoParams) => {
				const spaceInfoTool = new SpaceInfoTool(hfToken, username);
				const result = await formatSpaceInfoResult(spaceInfoTool, params);
				return {
					content: [{ type: 'text', text: result }],
				};
			}
		);

		const spaceFilesToolConfig = SpaceFilesTool.createToolConfig(username);
		toolInstances[spaceFilesToolConfig.name] = server.tool(
			spaceFilesToolConfig.name,
			spaceFilesToolConfig.description,
			spaceFilesToolConfig.schema.shape,
			spaceFilesToolConfig.annotations,
			async (params: SpaceFilesParams) => {
				const spaceFilesTool = new SpaceFilesTool(hfToken, username);
				const result = await spaceFilesTool.listFiles(params);
				return {
					content: [{ type: 'text', text: result }],
				};
			}
		);

		// Apply initial tool states based on current settings and bouquet
		for (const [toolName, toolInstance] of Object.entries(toolInstances)) {
			let isEnabled = sharedApiClient.getCachedToolState(toolName);

			// If a bouquet is specified, override the settings
			if (bouquet && BOUQUETS[bouquet]) {
				const allowedTools = BOUQUETS[bouquet];
				isEnabled = allowedTools.includes(toolName);
				logger.info({ toolName, bouquet, isEnabled }, 'Tool state set by bouquet');
			}

			if (!isEnabled) {
				toolInstance.disable();
				logger.debug({ toolName }, 'Tool disabled');
			}
		}

		const transportInfo = sharedApiClient.getTransportInfo();
		server.server.registerCapabilities({
			tools: {
				listChanged: !transportInfo?.jsonResponseEnabled,
			},
		});

		if (!transportInfo?.jsonResponseEnabled) {
			// Set up event listener for dynamic tool state changes
			sharedApiClient.on('toolStateChange', (toolId: string, enabled: boolean) => {
				const toolInstance = toolInstances[toolId];
				if (toolInstance) {
					if (enabled) {
						toolInstance.enable();
						logger.info({ toolId }, 'Tool enabled via API event');
					} else {
						toolInstance.disable();
						logger.info({ toolId }, 'Tool disabled via API event');
					}
				} else {
					logger.warn({ toolId }, 'Received tool state change for unknown tool');
				}
			});
		}

		return server;
	};
};
