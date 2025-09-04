import { logger } from './logger.js';
import type { AppSettings, SpaceTool } from '../../shared/settings.js';
import { ALL_BUILTIN_TOOL_IDS, HUB_INSPECT_TOOL_ID, TOOL_ID_GROUPS } from '@llmindset/hf-mcp';
import type { McpApiClient } from './mcp-api-client.js';
import { extractAuthBouquetAndMix } from '../utils/auth-utils.js';

export enum ToolSelectionMode {
	BOUQUET_OVERRIDE = 'bouquet_override',
	MIX = 'mix',
	EXTERNAL_API = 'external_api',
	INTERNAL_API = 'internal_api',
	FALLBACK = 'fallback',
}

export interface ToolSelectionContext {
	headers: Record<string, string> | null;
	userSettings?: AppSettings;
	hfToken?: string;
}

export interface ToolSelectionResult {
	mode: ToolSelectionMode;
	enabledToolIds: string[];
	reason: string;
	baseSettings?: AppSettings;
	mixedBouquet?: string;
	gradioSpaceTools?: SpaceTool[];
}

export const BOUQUETS: Record<string, AppSettings> = {
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
	docs: {
		builtInTools: [...TOOL_ID_GROUPS.docs],
		spaceTools: [],
	},
	all: {
		builtInTools: [...ALL_BUILTIN_TOOL_IDS],
		spaceTools: [],
	},
	// Test bouquets for README inclusion behavior
	hub_repo_details_readme: {
		builtInTools: [HUB_INSPECT_TOOL_ID, 'INCLUDE_README'],
		spaceTools: [],
	},
	hub_repo_details: {
		builtInTools: [HUB_INSPECT_TOOL_ID],
		spaceTools: [],
	},
};

/**
 * Tool Selection Strategy - implements clear precedence rules for tool selection
 */
export class ToolSelectionStrategy {
	private apiClient: McpApiClient;

	constructor(apiClient: McpApiClient) {
		this.apiClient = apiClient;
	}

	/**
	 * Parses gradio parameter and converts domain/space format to SpaceTool objects
	 * @param gradioParam Comma-delimited list of domain/space entries
	 * @returns Array of SpaceTool objects
	 */
	private parseGradioEndpoints(gradioParam: string): SpaceTool[] {
		const spaceTools: SpaceTool[] = [];
		const entries = gradioParam
			.split(',')
			.map((s) => s.trim())
			.filter((s) => s.length > 0);

		for (const entry of entries) {
			// Validate exactly one slash
			const slashCount = (entry.match(/\//g) || []).length;
			if (slashCount !== 1) {
				logger.warn(`Skipping invalid gradio entry "${entry}": must contain exactly one slash`);
				continue;
			}

			// Convert domain/space to subdomain format (replace / and . with -)
			const subdomain = entry.replace(/[/._]/g, '-');

			spaceTools.push({
				_id: `gradio_${subdomain}`,
				name: entry,
				subdomain: subdomain,
				emoji: '🔧',
			});

			logger.debug(`Added gradio endpoint: ${entry} -> ${subdomain}`);
		}

		return spaceTools;
	}

	/**
	 * Applies SEARCH_ENABLES_FETCH logic if enabled
	 * If hf_doc_search is enabled and SEARCH_ENABLES_FETCH=true, also enable hf_doc_fetch
	 */
	private applySearchEnablesFetch(enabledToolIds: string[]): string[] {
		if (process.env.SEARCH_ENABLES_FETCH === 'true') {
			if (enabledToolIds.includes('hf_doc_search') && !enabledToolIds.includes('hf_doc_fetch')) {
				logger.debug('SEARCH_ENABLES_FETCH: Auto-enabling hf_doc_fetch because hf_doc_search is enabled');
				return [...enabledToolIds, 'hf_doc_fetch'];
			}
		}
		return enabledToolIds;
	}

	/**
	 * Selects tools based on clear precedence rules:
	 * 1. Bouquet override (highest precedence)
	 * 2. Mix + user settings (additive)
	 * 3. User settings (external/internal API)
	 * 4. Fallback (all tools)
	 */
	async selectTools(context: ToolSelectionContext): Promise<ToolSelectionResult> {
		const { bouquet, mix, gradio } = extractAuthBouquetAndMix(context.headers);

		// Parse gradio endpoints if provided
		const gradioSpaceTools = gradio ? this.parseGradioEndpoints(gradio) : [];

		// 1. Bouquet override (highest precedence)
		if (bouquet && BOUQUETS[bouquet]) {
			const enabledToolIds = this.applySearchEnablesFetch(BOUQUETS[bouquet].builtInTools);
			logger.debug({ bouquet, enabledToolIds, gradioCount: gradioSpaceTools.length }, 'Using bouquet override');
			return {
				mode: ToolSelectionMode.BOUQUET_OVERRIDE,
				enabledToolIds,
				reason: `Bouquet override: ${bouquet}${gradioSpaceTools.length > 0 ? ` + ${gradioSpaceTools.length} gradio endpoints` : ''}`,
				gradioSpaceTools: gradioSpaceTools.length > 0 ? gradioSpaceTools : undefined,
			};
		}

		// 2. Get base user settings
		const baseSettings = await this.getUserSettings(context);

		// 3. Apply mix if specified and we have base settings
		if (mix && BOUQUETS[mix] && baseSettings) {
			const mixedTools = [...baseSettings.builtInTools, ...BOUQUETS[mix].builtInTools];
			const dedupedTools = [...new Set(mixedTools)]; // dedupe
			const enabledToolIds = this.applySearchEnablesFetch(dedupedTools);

			logger.debug(
				{
					mix,
					baseToolCount: baseSettings.builtInTools.length,
					mixToolCount: BOUQUETS[mix].builtInTools.length,
					finalToolCount: enabledToolIds.length,
				},
				'Applying mix to user settings'
			);

			return {
				mode: ToolSelectionMode.MIX,
				enabledToolIds,
				reason: `User settings + mix(${mix})${gradioSpaceTools.length > 0 ? ` + ${gradioSpaceTools.length} gradio endpoints` : ''}`,
				baseSettings,
				mixedBouquet: mix,
				gradioSpaceTools: gradioSpaceTools.length > 0 ? gradioSpaceTools : undefined,
			};
		}

		// 4. Use base settings if available
		if (baseSettings) {
			const mode = this.apiClient.getTransportInfo()?.externalApiMode
				? ToolSelectionMode.EXTERNAL_API
				: ToolSelectionMode.INTERNAL_API;

			const enabledToolIds = this.applySearchEnablesFetch(baseSettings.builtInTools);

			logger.debug(
				{
					mode,
					enabledToolIds,
				},
				'Using user settings'
			);

			return {
				mode,
				enabledToolIds,
				reason:
					mode === ToolSelectionMode.EXTERNAL_API
						? `External API user settings${gradioSpaceTools.length > 0 ? ` + ${gradioSpaceTools.length} gradio endpoints` : ''}`
						: `Internal API user settings${gradioSpaceTools.length > 0 ? ` + ${gradioSpaceTools.length} gradio endpoints` : ''}`,
				baseSettings,
				gradioSpaceTools: gradioSpaceTools.length > 0 ? gradioSpaceTools : undefined,
			};
		}

		// 5. Fallback - all tools enabled
		logger.warn('No settings available, using fallback (all tools enabled)');
		const enabledToolIds = this.applySearchEnablesFetch([...ALL_BUILTIN_TOOL_IDS]);
		return {
			mode: ToolSelectionMode.FALLBACK,
			enabledToolIds,
			reason: `Fallback - no settings available${gradioSpaceTools.length > 0 ? ` + ${gradioSpaceTools.length} gradio endpoints` : ''}`,
			gradioSpaceTools: gradioSpaceTools.length > 0 ? gradioSpaceTools : undefined,
		};
	}

	/**
	 * Gets user settings from provided context or API client
	 */
	private async getUserSettings(context: ToolSelectionContext): Promise<AppSettings | null> {
		// Use provided user settings (from proxy mode)
		if (context.userSettings) {
			logger.debug('Using provided user settings');
			return context.userSettings;
		}

		// Fetch from API client (skip in test environment)
		if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
			logger.debug('Skipping API client fetch in test environment');
			return null;
		}

		try {
			const toolStates = await this.apiClient.getToolStates(context.hfToken);
			if (toolStates) {
				const builtInTools = Object.keys(toolStates).filter((id) => toolStates[id]);
				// Note: spaceTools come from gradio endpoints in the API client
				const spaceTools = this.apiClient.getGradioEndpoints().map((endpoint) => ({
					name: endpoint.name,
					subdomain: endpoint.subdomain,
					_id: endpoint.id || endpoint.name,
					emoji: endpoint.emoji || '🛠️',
				}));

				return { builtInTools, spaceTools };
			}
		} catch (error) {
			logger.warn({ error }, 'Failed to fetch user settings from API client');
		}

		return null;
	}
}
