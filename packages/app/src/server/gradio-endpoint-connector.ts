import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport, type SSEClientTransportOptions } from '@modelcontextprotocol/sdk/client/sse.js';
import { ListToolsResultSchema, CallToolResultSchema, type Tool } from '@modelcontextprotocol/sdk/types.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { logger } from './lib/logger.js';
import { z } from 'zod';
import type { GradioEndpoint } from './lib/mcp-api-client.js';

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


interface EndpointConnection {
	endpointId: string;
	originalIndex: number;
	client: Client;
	tool: Tool;
	name?: string;
	emoji?: string;
}

type EndpointConnectionResult =
	| {
			success: true;
			endpointId: string;
			connection: EndpointConnection;
	  }
	| {
			success: false;
			endpointId: string;
			error: Error;
	  };

const CONNECTION_TIMEOUT_MS = 12000;

/**
 * Creates a timeout promise that rejects after the specified milliseconds
 */
function createTimeout(ms: number): Promise<never> {
	return new Promise((_, reject) => {
		setTimeout(() => {
			reject(new Error(`Connection timeout after ${ms.toString()}ms`));
		}, ms);
	});
}

/**
 * Connects to a single Gradio endpoint and retrieves its tools
 */
async function connectToSingleEndpoint(
	endpoint: GradioEndpoint,
	originalIndex: number,
	hfToken: string | undefined
): Promise<EndpointConnection> {
	const endpointId = `endpoint${(originalIndex + 1).toString()}`;
	const remoteUrl = new URL(`https://${endpoint.subdomain}.hf.space/gradio_api/mcp/sse`);

	logger.debug({ url: remoteUrl.toString(), endpointId }, 'Connecting to remote SSE endpoint');

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

	// Create SSE transport with HF token if available
	const transportOptions: SSEClientTransportOptions = {};
	if (hfToken) {
		const customHeaders = {
			Authorization: `Bearer ${hfToken}`,
		};

		// Headers for POST requests
		transportOptions.requestInit = {
			headers: customHeaders,
		};

		// Headers for SSE connection
		transportOptions.eventSourceInit = {
			fetch: (url, init) => {
				const headers = new Headers(init.headers);
				Object.entries(customHeaders).forEach(([key, value]) => {
					headers.set(key, value);
				});
				return fetch(url.toString(), { ...init, headers });
			},
		};

		logger.debug({ endpointId }, 'Including HF token in Gradio endpoint requests');
	}
	const transport = new SSEClientTransport(remoteUrl, transportOptions);

	// Connect the client to the transport
	await remoteClient.connect(transport);
	logger.debug({ endpointId }, 'Connected to remote SSE endpoint');

	// Get remote tools
	const remoteToolsResponse = await remoteClient.request(
		{
			method: 'tools/list',
		},
		ListToolsResultSchema
	);

	logger.debug(
		{
			endpointId,
			toolCount: remoteToolsResponse.tools.length,
			tools: remoteToolsResponse.tools.map((t) => t.name),
		},
		'Retrieved remote tools'
	);

	// Select which tool to use based on the algorithm:
	// 1. Find a tool containing "infer" (case-insensitive)
	// 2. Otherwise, use the last tool
	if (remoteToolsResponse.tools.length === 0) {
		throw new Error('No tools returned from remote endpoint');
	}

	let selectedTool = remoteToolsResponse.tools[remoteToolsResponse.tools.length - 1];

	const inferTool = remoteToolsResponse.tools.find((tool) => tool.name.toLowerCase().includes('infer'));

	if (inferTool) {
		selectedTool = inferTool;
		logger.debug({ endpointId, toolName: selectedTool.name }, 'Selected tool containing "infer"');
	} else if (selectedTool) {
		logger.debug({ endpointId, toolName: selectedTool.name }, 'Selected last tool (no "infer" tool found)');
	}

	if (!selectedTool) {
		throw new Error('No tool selected from remote endpoint');
	}

	return {
		endpointId,
		originalIndex,
		client: remoteClient,
		tool: selectedTool,
		name: endpoint.name,
		emoji: endpoint.emoji,
	};
}

/**
 * Connects to multiple Gradio endpoints in parallel with timeout
 *
 * HIGH PRIO TODO -- ADD A SHORT TERM CACHE FOR ENDPOINT DEFINITIONS
 *
 */
export async function connectToGradioEndpoints(
	gradioEndpoints: GradioEndpoint[],
	hfToken: string | undefined
): Promise<EndpointConnectionResult[]> {
	// Filter and map valid endpoints with their indices
	const validWithIndex = gradioEndpoints
		.map((ep, index) => ({ endpoint: ep, originalIndex: index }))
		.filter((item) => item.endpoint.subdomain && item.endpoint.subdomain.trim() !== '');

	if (validWithIndex.length === 0) {
		logger.debug('No valid Gradio endpoints to connect');
		return [];
	}

	// Create connection tasks with timeout
	const connectionTasks = validWithIndex.map(({ endpoint, originalIndex }) => {
		const endpointId = `endpoint${(originalIndex + 1).toString()}`;

		return Promise.race([
			connectToSingleEndpoint(endpoint, originalIndex, hfToken),
			createTimeout(CONNECTION_TIMEOUT_MS),
		])
			.then(
				(connection): EndpointConnectionResult => ({
					success: true,
					endpointId,
					connection,
				})
			)
			.catch(
				(error: unknown): EndpointConnectionResult => ({
					success: false,
					endpointId,
					error: error instanceof Error ? error : new Error(String(error)),
				})
			);
	});

	// Execute all connections in parallel
	const results = await Promise.all(connectionTasks);

	// Log results
	const successful = results.filter((r) => r.success);
	const failed = results.filter((r) => !r.success);

	logger.debug(
		{
			total: results.length,
			successful: successful.length,
			failed: failed.length,
			failedEndpoints: failed.map((f) => ({
				endpointId: f.endpointId,
				error: f.error.message,
			})),
		},
		'Gradio endpoint connection results'
	);

	return results;
}

/**
 * Registers a remote tool from a Gradio endpoint
 */
export function registerRemoteTool(
	server: McpServer,
	endpointId: string,
	originalIndex: number,
	client: Client,
	tool: Tool,
	name?: string,
	emoji?: string
): void {
	// Use new naming convention: gr<index>_<sanitized_name>
	// Convert "evalstate/flux1_schnell" to "evalstate_flux1_schnell"
	const sanitizedName = name ? name.replace(/[/\-\s]+/g, '_').toLowerCase() : 'unknown';
	const remoteName = `gr${(originalIndex + 1).toString()}_${sanitizedName}`;
	logger.debug(
		{
			endpointId,
			originalName: tool.name,
			remoteName,
			description: tool.description,
		},
		'Registering remote tool'
	);

	// Log the exact structure we're getting
	logger.debug(
		{
			toolName: tool.name,
			inputSchema: tool.inputSchema,
		},
		'Remote tool inputSchema structure'
	);

	// Convert JSON Schema to Zod schema
	const schemaShape: Record<string, z.ZodTypeAny> = {};

	if (typeof tool.inputSchema === 'object' && 'properties' in tool.inputSchema) {
		const jsonSchema = tool.inputSchema as JsonSchema;
		const props = jsonSchema.properties || {};
		const required = jsonSchema.required || [];

		for (const [key, jsonSchemaProperty] of Object.entries(props)) {
			const isRequired = required.includes(key);

			// Convert to Zod schema, skipping defaults for required fields
			let zodSchema = convertJsonSchemaToZod(jsonSchemaProperty, isRequired);

			// Make optional if not in required array
			if (!isRequired) {
				zodSchema = zodSchema.optional();
			}

			schemaShape[key] = zodSchema;
		}
	}

	// Create user-friendly title and description
	const displayName = name || 'Unknown Space';
	const toolTitle = `${displayName} - ${tool.name}${emoji ? ` ${emoji}` : ''}`;
	const toolDescription = tool.description 
		? `${tool.description} (from ${displayName})`
		: `${tool.name} tool from ${displayName}`;

	server.tool(
		remoteName,
		toolDescription,
		schemaShape,
		{ 
			openWorldHint: true,
			title: toolTitle 
		}, // annotations parameter
		async (params: Record<string, unknown>) => {
			logger.info({ tool: tool.name, params }, 'Calling remote tool');
			try {
				const result = await client.request(
					{
						method: 'tools/call',
						params: {
							name: tool.name,
							arguments: params,
						},
					},
					CallToolResultSchema
				);
				logger.debug({ tool: tool.name }, 'Remote tool call successful');
				return result;
			} catch (error) {
				logger.debug({ tool: tool.name, error }, 'Remote tool call failed');
				throw error;
			}
		}
	);
}

/**
 * Converts a JSON Schema property to a Zod schema
 * @param jsonSchemaProperty - The JSON schema property to convert
 * @param skipDefault - If true, won't apply default values (useful for required fields)
 */
function convertJsonSchemaToZod(jsonSchemaProperty: JsonSchemaProperty, skipDefault = false): z.ZodTypeAny {
	let zodSchema: z.ZodTypeAny;

	// Special handling for FileData types
	if (
		jsonSchemaProperty.title === 'FileData' ||
		(jsonSchemaProperty.format === 'a http or https url to a file' &&
			typeof jsonSchemaProperty.default === 'object' &&
			jsonSchemaProperty.default !== null)
	) {
		// Create FileData object schema
		zodSchema = z.object({
			path: z.string(),
			url: z.string().optional(),
			size: z.number().nullable().optional(),
			orig_name: z.string().optional(),
			mime_type: z.string().nullable().optional(),
			is_stream: z.boolean().optional(),
			meta: z
				.object({
					_type: z.string().optional(),
				})
				.optional(),
		});
	} else {
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
	}

	// Enhance description for file inputs
	let description = jsonSchemaProperty.description || '';
	if (jsonSchemaProperty.format === 'a http or https url to a file' || jsonSchemaProperty.title === 'FileData') {
		description = description
			? `${description} (File input: provide URL or file path)`
			: 'File input: provide URL or file path';
	}

	if (description) {
		zodSchema = zodSchema.describe(description);
	}

	// Handle defaults (only if not skipping)
	if (!skipDefault && 'default' in jsonSchemaProperty && jsonSchemaProperty.default !== undefined) {
		let defaultValue = jsonSchemaProperty.default;

		// For FileData types, keep the full object as default
		// For other string types with object defaults, extract URL
		if (
			jsonSchemaProperty.type === 'string' &&
			typeof defaultValue === 'object' &&
			defaultValue !== null &&
			'url' in defaultValue &&
			jsonSchemaProperty.title !== 'FileData'
		) {
			const urlValue = (defaultValue as Record<string, unknown>).url;
			if (typeof urlValue === 'string') {
				defaultValue = urlValue;
			}
		}

		zodSchema = zodSchema.default(defaultValue);
	}

	return zodSchema;
}
