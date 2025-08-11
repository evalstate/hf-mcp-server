//import { datasetInfo, listFiles, repoExists } from '@huggingface/hub';
import type { ServerFactory, ServerFactoryResult } from './transport/base-transport.js';
import type { McpApiClient } from './utils/mcp-api-client.js';
import type { WebServer } from './web-server.js';
import type { AppSettings } from '../shared/settings.js';
import { logger } from './utils/logger.js';
import { connectToGradioEndpoints, registerRemoteTools } from './gradio-endpoint-connector.js';
import { extractAuthBouquetAndMix } from './utils/auth-utils.js';
import type { SpaceTool } from '../shared/settings.js';
import { repoExists } from '@huggingface/hub';
import type { GradioFilesParams } from '@llmindset/hf-mcp';
import { GRADIO_FILES_TOOL_CONFIG, GradioFilesTool } from '@llmindset/hf-mcp';
import { logSearchQuery } from './utils/query-logger.js';

/**
 * Parses gradio parameter and converts domain/space format to SpaceTool objects
 */
function parseGradioEndpoints(gradioParam: string): SpaceTool[] {
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
		const subdomain = entry.replace(/[/.]/g, '-');

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
		skipGradio?: boolean,
		sessionInfo?: {
			clientSessionId?: string;
			isAuthenticated?: boolean;
			clientInfo?: { name: string; version: string };
		}
	): Promise<ServerFactoryResult> => {
		logger.debug('=== PROXY FACTORY CALLED ===', { skipGradio });

		// Extract auth, bouquet, and gradio using shared utility
		const { hfToken, bouquet, gradio } = extractAuthBouquetAndMix(headers);

		// Skip expensive operations for requests that skip Gradio
		let settings = userSettings;
		if (!skipGradio && !settings && !bouquet) {
			settings = await sharedApiClient.getSettings(hfToken);
			logger.debug({ hasSettings: !!settings }, 'Fetched user settings for proxy');
		}

		// Create the original server instance with user settings
		const result = await originalServerFactory(headers, settings, skipGradio, sessionInfo);
		const { server, userDetails } = result;

		// Skip Gradio endpoint connection for requests that skip Gradio
		if (skipGradio) {
			logger.debug('Skipping Gradio endpoints (initialize or non-Gradio tool call)');
			return result;
		}

		// Skip Gradio endpoints if bouquet is not "all"
		if (bouquet && bouquet !== 'all') {
			logger.debug({ bouquet }, 'Bouquet specified and not "all", skipping Gradio endpoints');
			return result;
		}

		// Now we have access to userDetails if needed
		if (userDetails) {
			logger.debug(`Proxy has access to user details for: ${userDetails.name}`);
		}

		// Parse gradio parameter and merge with settings
		const gradioSpaceTools = gradio ? parseGradioEndpoints(gradio) : [];
		const existingSpaceTools = settings?.spaceTools || [];
		const allSpaceTools = [...existingSpaceTools, ...gradioSpaceTools];

		// Convert to GradioEndpoint format
		const gradioEndpoints = allSpaceTools.map((spaceTool) => ({
			name: spaceTool.name,
			subdomain: spaceTool.subdomain,
			id: spaceTool._id,
			emoji: spaceTool.emoji,
		}));

		logger.debug(
			{
				existingCount: existingSpaceTools.length,
				gradioCount: gradioSpaceTools.length,
				totalEndpoints: gradioEndpoints.length,
				gradioParam: gradio,
			},
			'Merged Gradio endpoints from settings and query parameter'
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
			return result;
		}

		// Connect to all valid endpoints in parallel with timeout
		const connections = await connectToGradioEndpoints(validEndpoints, hfToken);

		// Register tools from successful connections
		for (const connection of connections) {
			if (!connection.success) continue;

			registerRemoteTools(server, connection.connection, hfToken);
		}

		if (sessionInfo?.isAuthenticated && userDetails?.name && hfToken) {
			const username = userDetails.name; // Capture username for closure
			const token = hfToken; // Capture token for closure
			const exists = await repoExists({
				repo: { type: 'dataset', name: `${username}/gradio-files` },
			});
			if (exists)
				server.tool(
					GRADIO_FILES_TOOL_CONFIG.name,
					GRADIO_FILES_TOOL_CONFIG.description,
					GRADIO_FILES_TOOL_CONFIG.schema.shape,
					GRADIO_FILES_TOOL_CONFIG.annotations,
					async (params: GradioFilesParams) => {
						const tool = new GradioFilesTool(token, username);
						const markdown = await tool.generateDetailedMarkdown(params.fileType);
						
						// Log the tool usage
						logSearchQuery(
							GRADIO_FILES_TOOL_CONFIG.name,
							`${username}/gradio-files`,
							{ fileType: params.fileType },
							{
								clientSessionId: sessionInfo?.clientSessionId,
								isAuthenticated: sessionInfo?.isAuthenticated ?? true,
								clientName: sessionInfo?.clientInfo?.name,
								clientVersion: sessionInfo?.clientInfo?.version,
								responseCharCount: markdown.length,
							}
						);
						
						return {
							content: [{ type: 'text', text: markdown }],
						};
					}
				);
			/* TODO -- reinstate once method handling is improved; 
			server.prompt(
				GRADIO_FILES_PROMPT_CONFIG.name,
				GRADIO_FILES_PROMPT_CONFIG.description,
				GRADIO_FILES_PROMPT_CONFIG.schema.shape,
				async () => {
					return {
						description: `Gradio Files summary for ${username}`,
						messages: [
							{
								role: 'user' as const,
								content: {
									type: 'text' as const,
									text: await new GradioFilesTool(token, username).generateDetailedMarkdown('all'),
								},
							},
						],
					};
				}
			);
			*/
		}

		logger.debug('Server ready with local and remote tools');
		return result;
	};
};
