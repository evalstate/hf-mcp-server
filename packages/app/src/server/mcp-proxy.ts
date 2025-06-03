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
			logger.info({ bouquet }, 'Bouquet parameter will be handled by original server factory');
		}

		// Get enabled Gradio endpoints from the API client
		const gradioEndpoints = sharedApiClient.getGradioEndpoints();
		logger.info(
			{
				gradioEndpoints: gradioEndpoints.map((ep, i) => ({
					index: i,
					url: ep.url,
					enabled: ep.enabled,
				})),
			},
			'All Gradio endpoints'
		);

		const enabledEndpoints = gradioEndpoints.filter((ep) => ep.enabled !== false);
		logger.info(
			{
				enabledCount: enabledEndpoints.length,
				enabledUrls: enabledEndpoints.map((ep) => ep.url),
			},
			'Filtered enabled endpoints'
		);

		if (enabledEndpoints.length === 0) {
			logger.info('No enabled Gradio endpoints, using local tools only');
			return server;
		}

		// Connect to all enabled endpoints in parallel with timeout
		const connections = await connectToGradioEndpoints(gradioEndpoints, hfToken);
		
		// Register tools from successful connections
		for (const result of connections) {
			if (!result.success) continue;
			
			const { endpointId, originalIndex, client, tool } = result.connection;
			registerRemoteTool(server, endpointId, originalIndex, client, tool);
		}

		logger.info('Server ready with local and remote tools');
		return server;
	};
};