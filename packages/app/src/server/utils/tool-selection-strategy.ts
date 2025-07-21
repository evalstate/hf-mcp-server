import { logger } from './logger.js';
import type { AppSettings } from '../../shared/settings.js';
import { ALL_BUILTIN_TOOL_IDS, TOOL_ID_GROUPS } from '@llmindset/hf-mcp';
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
		const { bouquet, mix } = extractAuthBouquetAndMix(context.headers);

		// 1. Bouquet override (highest precedence)
		if (bouquet && BOUQUETS[bouquet]) {
			const enabledToolIds = this.applySearchEnablesFetch(BOUQUETS[bouquet].builtInTools);
			logger.debug({ bouquet, enabledToolIds }, 'Using bouquet override');
			return {
				mode: ToolSelectionMode.BOUQUET_OVERRIDE,
				enabledToolIds,
				reason: `Bouquet override: ${bouquet}`,
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
				reason: `User settings + mix(${mix})`,
				baseSettings,
				mixedBouquet: mix,
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
				reason: mode === ToolSelectionMode.EXTERNAL_API ? 'External API user settings' : 'Internal API user settings',
				baseSettings,
			};
		}

		// 5. Fallback - all tools enabled
		logger.warn('No settings available, using fallback (all tools enabled)');
		const enabledToolIds = this.applySearchEnablesFetch([...ALL_BUILTIN_TOOL_IDS]);
		return {
			mode: ToolSelectionMode.FALLBACK,
			enabledToolIds,
			reason: 'Fallback - no settings available',
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
