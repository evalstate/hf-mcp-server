import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ServerFactory } from './transport/base-transport.js';
import type { McpApiClient } from './lib/mcp-api-client.js';
import type { WebServer } from './web-server.js';
import type { AppSettings } from '../shared/settings.js';
import { logger } from './lib/logger.js';
import { connectToGradioEndpoints, registerRemoteTools } from './gradio-endpoint-connector.js';
import { extractAuthBouquetAndMix } from './utils/auth-utils.js';

/**
 * Creates a proxy ServerFactory that adds remote tools to the original server.
 */
export const createProxyServerFactory = (
	_webServerInstance: WebServer,
	sharedApiClient: McpApiClient,
	originalServerFactory: ServerFactory
): ServerFactory => {
	return async (
		headers: Record<string, string> | null,
		userSettings?: AppSettings,
		skipGradio?: boolean
	): Promise<McpServer> => {
		logger.debug('=== PROXY FACTORY CALLED ===', { skipGradio });

		// Extract auth and bouquet using shared utility
		const { hfToken, bouquet } = extractAuthBouquetAndMix(headers);

		// Skip expensive operations for requests that skip Gradio
		let settings = userSettings;
		if (!skipGradio && !settings && !bouquet) {
			settings = await sharedApiClient.getSettings(hfToken);
			logger.debug({ hasSettings: !!settings }, 'Fetched user settings for proxy');
		}

		// Create the original server instance with user settings
		const server = await originalServerFactory(headers, settings, skipGradio);

		// Skip Gradio endpoint connection for requests that skip Gradio
		if (skipGradio) {
			logger.debug('Skipping Gradio endpoints (initialize or non-Gradio tool call)');
			return server;
		}

		// Skip Gradio endpoints if bouquet is "search"
		if (bouquet === 'search') {
			logger.debug({ bouquet }, 'Bouquet is "search", skipping all Gradio endpoints');
			return server;
		}

		// Get Gradio endpoints from settings
		const gradioEndpoints =
			settings?.spaceTools?.map((spaceTool) => ({
				name: spaceTool.name,
				subdomain: spaceTool.subdomain,
				id: spaceTool._id,
				emoji: spaceTool.emoji,
			})) || [];

		logger.debug(
			{
				rawEndpoints: gradioEndpoints,
				endpointCount: gradioEndpoints.length,
			},
			'Raw Gradio endpoints from API client'
		);

		// Filter out endpoints with empty subdomain and construct URLs
		const validEndpoints = gradioEndpoints
			.filter((ep) => {
				const isValid = ep.subdomain && ep.subdomain.trim() !== '';
				if (!isValid) {
					logger.debug(
						{
							endpoint: ep,
							reason: !ep.subdomain ? 'missing subdomain' : 'empty subdomain',
						},
						'Filtering out invalid endpoint'
					);
				}
				return isValid;
			})
			.map((ep) => ({
				...ep,
				url: `https://${ep.subdomain}.hf.space/gradio_api/mcp/sse`,
			}));

		logger.debug(
			{
				totalCount: gradioEndpoints.length,
				validCount: validEndpoints.length,
				validEndpoints: validEndpoints.map((ep) => ({ name: ep.name, subdomain: ep.subdomain, url: ep.url })),
			},
			'Gradio endpoints after filtering and URL construction'
		);

		if (validEndpoints.length === 0) {
			logger.debug('No valid Gradio endpoints, using local tools only');
			return server;
		}

		// Connect to all valid endpoints in parallel with timeout
		const connections = await connectToGradioEndpoints(validEndpoints, hfToken);

		// Register tools from successful connections
		for (const result of connections) {
			if (!result.success) continue;

			registerRemoteTools(server, result.connection, hfToken);
		}

		logger.debug('Server ready with local and remote tools');
		return server;
	};
};
