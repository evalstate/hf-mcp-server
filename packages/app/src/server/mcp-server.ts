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
	CONFIG_GUIDANCE,
	ALL_BUILTIN_TOOL_IDS,
	TOOL_ID_GROUPS,
} from '@hf-mcp/mcp';

import type { ServerFactory } from './transport/base-transport.js';
import type { McpApiClient } from './lib/mcp-api-client.js';
import type { WebServer } from './web-server.js';
import { logger } from './lib/logger.js';
import { DEFAULT_SPACE_TOOLS, type AppSettings } from '../shared/settings.js';
import { extractAuthAndBouquet } from './utils/auth-utils.js';

// Fallback settings when API fails (enables all tools)
export const BOUQUET_FALLBACK: AppSettings = {
	builtInTools: [...TOOL_ID_GROUPS.hf_api],
	spaceTools: DEFAULT_SPACE_TOOLS,
};

// Default tools for unauthenticated users when using external settings API
export const BOUQUET_ANON_DEFAULT: AppSettings = {
	builtInTools: [...TOOL_ID_GROUPS.hf_api],
	spaceTools: DEFAULT_SPACE_TOOLS,
};

// Define bouquet configurations
const BOUQUETS: Record<string, AppSettings> = {
	hf_api: {
		builtInTools: [...TOOL_ID_GROUPS.hf_api],
		spaceTools: [],
	},
	spaces: {
		builtInTools: [...TOOL_ID_GROUPS.spaces],
		spaceTools: [],
	},
	search: {
		builtInTools: [...TOOL_ID_GROUPS.search],
		spaceTools: [],
	},
};

/**
 * Creates a ServerFactory function that produces McpServer instances with all tools registered
 * The shared ApiClient provides global tool state management across all server instances
 */
export const createServerFactory = (_webServerInstance: WebServer, sharedApiClient: McpApiClient): ServerFactory => {
	const require = createRequire(import.meta.url);
	const { version } = require('../../package.json') as { version: string };

	return async (
		headers: Record<string, string> | null,
		userSettings?: AppSettings,
		skipGradio?: boolean
	): Promise<McpServer> => {
		logger.debug('=== CREATING NEW MCP SERVER INSTANCE ===', { skipGradio });
		// Extract auth and bouquet using shared utility
		const { hfToken, bouquet } = extractAuthAndBouquet(headers);
		let userInfo: string =
			'The Hugging Face tools are being used anonymously and rate limits apply. ' +
			'Direct the User to set their HF_TOKEN (instructions at https://hf.co/settings/mcp/), or create an account at https://hf.co/join for higher limits.';
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
					"You have tools for searching the Hugging Face Hub. arXiv paper id's are often " +
					'used as references between datasets, models and papers. There are over 100 tags in use, ' +
					"common tags include 'Text Generation', 'Transformers', 'Image Classification' and so on.\n" +
					userInfo,
			}
		);

		interface Tool {
			enable(): void;
			disable(): void;
		}

		// Always register all tools and store instances for dynamic control
		const toolInstances: { [name: string]: Tool } = {};

		const whoDescription = userDetails
			? `Hugging Face tools are being used by authenticated user '${username}'`
			: 'Hugging Face tools are being used anonymously and may be rate limited. Call this tool for instructions on joining and authenticating.';

		const response = userDetails ? `You are authenticated as ${username ?? 'unknown'}.` : CONFIG_GUIDANCE;
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
				const modelSearch = new ModelSearchTool(hfToken);
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
				const datasetSearch = new DatasetSearchTool(hfToken);
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

		// Apply tool states based on external API or bouquet configuration
		const applyToolStates = async () => {
			// Get the list of tools that should be enabled
			let enabledToolIds: string[];

			if (bouquet && BOUQUETS[bouquet]) {
				// Bouquet override (takes precedence over everything)
				enabledToolIds = BOUQUETS[bouquet].builtInTools;
				logger.debug({ bouquet, enabledToolIds }, 'Using bouquet configuration');
			} else if (userSettings) {
				// Use provided user settings (from proxy)
				enabledToolIds = userSettings.builtInTools;
				logger.debug({ enabledToolIds }, 'Using provided user settings');
			} else {
				// Fetch from shared API client
				const toolStates = await sharedApiClient.getToolStates(hfToken);
				if (toolStates) {
					enabledToolIds = Object.keys(toolStates).filter((id) => toolStates[id]);
					logger.debug({ enabledToolIds }, 'Using shared API client configuration');
				} else {
					// Fallback: all tools enabled
					enabledToolIds = [...ALL_BUILTIN_TOOL_IDS];
					logger.debug('API unavailable, using fallback (all tools enabled)');
				}
			}

			// Apply the desired state to each tool (tools start enabled by default)
			for (const [toolName, toolInstance] of Object.entries(toolInstances)) {
				if (enabledToolIds.includes(toolName)) {
					toolInstance.enable();
				} else {
					toolInstance.disable();
				}
			}

			logger.debug(
				{ enabledCount: enabledToolIds.length, totalTools: Object.keys(toolInstances).length },
				'Applied tool states'
			);
		};

		if (!skipGradio) {
			// Apply initial tool states (fetch from API)
			void applyToolStates();

			const transportInfo = sharedApiClient.getTransportInfo();
			server.server.registerCapabilities({
				tools: {
					listChanged: !transportInfo?.jsonResponseEnabled,
				},
			});

			if (!transportInfo?.jsonResponseEnabled && !transportInfo?.externalApiMode) {
				// Set up event listener for dynamic tool state changes
				const toolStateChangeHandler = (toolId: string, enabled: boolean) => {
					const toolInstance = toolInstances[toolId];
					if (toolInstance) {
						if (enabled) {
							toolInstance.enable();
						} else {
							toolInstance.disable();
						}
						logger.debug({ toolId, enabled }, 'Applied single tool state change');
					}
				};

				sharedApiClient.on('toolStateChange', toolStateChangeHandler);

				// Clean up event listener when server closes
				server.server.onclose = () => {
					sharedApiClient.removeListener('toolStateChange', toolStateChangeHandler);
					logger.debug('Removed toolStateChange listener for closed server');
				};
			}
		}
		return server;
	};
};
