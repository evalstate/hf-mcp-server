import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ServerFactory } from './transport/base-transport.js';
import type { McpApiClient } from './lib/mcp-api-client.js';
import type { WebServer } from './web-server.js';
import { logger } from './lib/logger.js';
import { extractAuthAndBouquet } from './utils/auth-utils.js';
import { connectToGradioEndpoints, registerRemoteTool } from './gradio-endpoint-connector.js';

/**
 * Creates a proxy ServerFactory that adds remote tools to the original server.
 */
export const createProxyServerFactory = (
	_webServerInstance: WebServer,
	sharedApiClient: McpApiClient,
	originalServerFactory: ServerFactory
): ServerFactory => {
	return async (headers: Record<string, string> | null): Promise<McpServer> => {
		logger.info('Creating server with remote tool support');

		// Create the original server instance with all local tools
		const server = await originalServerFactory(headers);

		// Extract auth and bouquet using shared utility (for consistency)
		const { hfToken, bouquet } = extractAuthAndBouquet(headers);
		if (bouquet) {
			logger.debug({ bouquet }, 'Bouquet parameter will be handled by original server factory');
		}

		// Skip Gradio endpoints if bouquet is "search"
		if (bouquet === 'search') {
			logger.debug('Bouquet is "search", skipping Gradio endpoints');
			return server;
		}

		// Get Gradio endpoints from the API client
		const gradioEndpoints = sharedApiClient.getGradioEndpoints();
		
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
							reason: !ep.subdomain ? 'missing subdomain' : 'empty subdomain'
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

			const { endpointId, originalIndex, client, tool, name, emoji } = result.connection;
			registerRemoteTool(server, endpointId, originalIndex, client, tool, name, emoji);
		}

		logger.debug('Server ready with local and remote tools');
		return server;
	};
};
