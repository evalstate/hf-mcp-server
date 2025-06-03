import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { ListToolsResultSchema, CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import type { ServerFactory } from './transport/base-transport.js';
import type { McpApiClient } from './lib/mcp-api-client.js';
import type { WebServer } from './web-server.js';
import { logger } from './lib/logger.js';
import { z } from 'zod';

// Define types for JSON Schema
interface JsonSchemaProperty {
	type?: string;
	description?: string;
	default?: unknown;
	[key: string]: unknown;
}

interface JsonSchema {
	type?: string;
	properties?: Record<string, JsonSchemaProperty>;
	required?: string[];
	[key: string]: unknown;
}

/**
 * Creates a proxy ServerFactory that adds remote tools to the original server.
 */
export const createProxyServerFactory = (
	_webServerInstance: WebServer,
	_sharedApiClient: McpApiClient,
	originalServerFactory: ServerFactory
): ServerFactory => {
	return async (headers: Record<string, string> | null): Promise<McpServer> => {
		logger.info('Creating server with remote tool support');

		// Create the original server instance with all local tools
		const server = await originalServerFactory(headers);

		try {
			// Connect to the Flux1 Schnell SSE endpoint
			const remoteUrl = new URL('https://evalstate-flux1-schnell.hf.space/gradio_api/mcp/sse');
			logger.info({ url: remoteUrl.toString() }, 'Connecting to remote SSE endpoint');

			// Create MCP client
			const remoteClient = new Client(
				{
					name: 'hf-mcp-proxy-client',
					version: '1.0.0',
				},
				{
					capabilities: {},
				}
			);

			// Create SSE transport
			const transport = new SSEClientTransport(remoteUrl);

			// Connect the client to the transport
			await remoteClient.connect(transport);
			logger.info('Connected to remote SSE endpoint');

			// Get remote tools
			const remoteToolsResponse = await remoteClient.request(
				{
					method: 'tools/list',
				},
				ListToolsResultSchema
			);

			logger.info(
				{
					toolCount: remoteToolsResponse.tools.length,
					tools: remoteToolsResponse.tools.map((t) => t.name),
				},
				'Retrieved remote tools'
			);

			// Add each remote tool to the server
			remoteToolsResponse.tools.forEach((tool) => {
				const remoteName = `remote_${tool.name}`;
				logger.info(
					{
						originalName: tool.name,
						remoteName,
						description: tool.description,
					},
					'Registering remote tool'
				);

				// Log the exact structure we're getting
				logger.info({
					toolName: tool.name,
					inputSchema: tool.inputSchema,
				}, 'Remote tool inputSchema structure');

				// Convert JSON Schema to Zod schema
				const schemaShape: Record<string, z.ZodTypeAny> = {};
				
				if (typeof tool.inputSchema === 'object' && 'properties' in tool.inputSchema) {
					const jsonSchema = tool.inputSchema as JsonSchema;
					const props = jsonSchema.properties || {};
					const required = jsonSchema.required || [];
					
					for (const [key, jsonSchemaProperty] of Object.entries(props)) {
						let zodSchema: z.ZodTypeAny;
						
						// Convert based on type
						switch (jsonSchemaProperty.type) {
							case 'string':
								zodSchema = z.string();
								break;
							case 'number':
								zodSchema = z.number();
								break;
							case 'boolean':
								zodSchema = z.boolean();
								break;
							case 'array':
								zodSchema = z.array(z.any()); // Simplified for now
								break;
							case 'object':
								zodSchema = z.object({}); // Simplified for now
								break;
							default:
								zodSchema = z.any();
						}
						
						// Add description
						if (jsonSchemaProperty.description) {
							zodSchema = zodSchema.describe(jsonSchemaProperty.description);
						}
						
						// Handle defaults
						if ('default' in jsonSchemaProperty && jsonSchemaProperty.default !== undefined) {
							zodSchema = zodSchema.default(jsonSchemaProperty.default);
						}
						
						// Make optional if not in required array
						if (!required.includes(key)) {
							zodSchema = zodSchema.optional();
						}
						
						schemaShape[key] = zodSchema;
					}
				}

				server.tool(
					remoteName,
					`[Remote] ${tool.description || tool.name}`,
					schemaShape, // Now using Zod schemas
					{ openWorldHint: true }, // annotations parameter
					async (params: Record<string, unknown>) => {
						logger.info({ tool: tool.name, params }, 'Calling remote tool');
						try {
							const result = await remoteClient.request(
								{
									method: 'tools/call',
									params: {
										name: tool.name,
										arguments: params,
									},
								},
								CallToolResultSchema
							);
							logger.info({ tool: tool.name }, 'Remote tool call successful');
							return result;
						} catch (error) {
							logger.error({ tool: tool.name, error }, 'Remote tool call failed');
							throw error;
						}
					}
				);
			});

			logger.info('Server ready with local and remote tools');
		} catch (error) {
			logger.error({ error }, 'Failed to connect to remote SSE endpoint');
			logger.info('Server ready with local tools only');
		}

		return server;
	};
};