import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport, type SSEClientTransportOptions } from '@modelcontextprotocol/sdk/client/sse.js';
import { CallToolResultSchema, type Tool } from '@modelcontextprotocol/sdk/types.js';
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

// Define type for array format schema
interface ArrayFormatTool {
	name: string;
	description?: string;
	inputSchema: JsonSchema;
}


interface EndpointConnection {
	endpointId: string;
	originalIndex: number;
	client: Client | null; // Will be null when using schema-only approach
	tool: Tool;
	name?: string;
	emoji?: string;
	sseUrl?: string; // Store the SSE URL for lazy connection during tool calls
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
 * Parses schema response and extracts tools based on format (array or object)
 */
export function parseSchemaResponse(
	schemaResponse: unknown,
	endpointId: string,
	subdomain: string
): { name: string; description?: string; inputSchema: JsonSchema } {
	// Handle both array and object schema formats
	let tools: Array<{ name: string; description?: string; inputSchema: JsonSchema }> = [];
	
	if (Array.isArray(schemaResponse)) {
		// Array format: [{ name: "toolName", description: "...", inputSchema: {...} }, ...]
		tools = (schemaResponse as ArrayFormatTool[]).filter((tool): tool is ArrayFormatTool => 
			typeof tool === 'object' && 
			tool !== null && 
			'name' in tool && 
			typeof tool.name === 'string' &&
			'inputSchema' in tool
		);
		logger.debug(
			{
				endpointId,
				toolCount: tools.length,
				tools: tools.map(t => t.name),
			},
			'Retrieved schema (array format)'
		);
	} else if (typeof schemaResponse === 'object' && schemaResponse !== null) {
		// Object format: { "toolName": { properties: {...}, required: [...] }, ... }
		const schema = schemaResponse as Record<string, JsonSchema>;
		tools = Object.entries(schema).map(([name, toolSchema]) => ({
			name,
			description: typeof toolSchema.description === 'string' ? toolSchema.description : undefined,
			inputSchema: toolSchema,
		}));
		logger.debug(
			{
				endpointId,
				toolCount: tools.length,
				tools: tools.map(t => t.name),
			},
			'Retrieved schema (object format)'
		);
	} else {
		logger.error({ endpointId, subdomain, schemaType: typeof schemaResponse }, 'Invalid schema format');
		throw new Error('Invalid schema format: expected array or object');
	}

	if (tools.length === 0) {
		logger.error({ endpointId, subdomain }, 'No tools found in schema');
		throw new Error('No tools found in schema');
	}

	// Select which tool to use based on the algorithm:
	// 1. Find a tool containing "infer" (case-insensitive)
	// 2. Otherwise, use the last tool
	let selectedTool = tools[tools.length - 1];
	if (!selectedTool) {
		logger.error({ endpointId, subdomain }, 'No tool selected from available tools');
		throw new Error('No tool selected from available tools');
	}
	
	const inferTool = tools.find((tool) => tool.name.toLowerCase().includes('infer'));

	if (inferTool) {
		selectedTool = inferTool;
		logger.debug({ endpointId, toolName: selectedTool.name }, 'Selected tool containing "infer"');
	} else {
		logger.debug({ endpointId, toolName: selectedTool.name }, 'Selected last tool (no "infer" tool found)');
	}

	return selectedTool;
}

/**
 * Fetches schema from a single Gradio endpoint without establishing SSE connection
 */
async function fetchEndpointSchema(
	endpoint: GradioEndpoint,
	originalIndex: number,
	hfToken: string | undefined
): Promise<EndpointConnection> {
	const endpointId = `endpoint${(originalIndex + 1).toString()}`;
	const schemaUrl = `https://${endpoint.subdomain}.hf.space/gradio_api/mcp/schema`;

	logger.debug({ url: schemaUrl, endpointId }, 'Fetching schema from endpoint');

	// Prepare headers
	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
	};
	if (hfToken) {
		headers.Authorization = `Bearer ${hfToken}`;
		logger.debug({ endpointId }, 'Including HF token in schema request');
	}

	// Add timeout using AbortController (same pattern as HfApiCall)
	const apiTimeout = process.env.HF_API_TIMEOUT ? parseInt(process.env.HF_API_TIMEOUT, 10) : 12500;
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), apiTimeout);

	// Fetch schema directly
	const response = await fetch(schemaUrl, {
		method: 'GET',
		headers,
		signal: controller.signal,
	});

	clearTimeout(timeoutId);

	if (!response.ok) {
		logger.error({ 
			endpointId, 
			subdomain: endpoint.subdomain, 
			status: response.status, 
			statusText: response.statusText 
		}, 'Failed to fetch schema from endpoint');
		throw new Error(`Failed to fetch schema: ${response.status} ${response.statusText}`);
	}

	const schemaResponse = await response.json() as unknown;
	
	// Parse the schema response
	const selectedTool = parseSchemaResponse(schemaResponse, endpointId, endpoint.subdomain);

	// Create tool with raw JSON schema (conversion to Zod happens in registerRemoteTool)
	const tool: Tool = {
		name: selectedTool.name,
		description: selectedTool.description || `${selectedTool.name} tool`,
		inputSchema: {
			type: 'object',
			properties: selectedTool.inputSchema.properties || {},
			required: selectedTool.inputSchema.required || [],
			description: selectedTool.inputSchema.description,
		},
	};

	return {
		endpointId,
		originalIndex,
		client: null, // No client connection yet
		tool,
		name: endpoint.name,
		emoji: endpoint.emoji,
		sseUrl: `https://${endpoint.subdomain}.hf.space/gradio_api/mcp/sse`, // Store SSE URL for later
	};
}

/**
 * Fetches schemas from multiple Gradio endpoints in parallel with timeout
 * Uses efficient /mcp/schema endpoint instead of SSE connections
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
		logger.debug('No valid Gradio endpoints to fetch schemas from');
		return [];
	}

	// Create schema fetch tasks with timeout
	const schemaFetchTasks = validWithIndex.map(({ endpoint, originalIndex }) => {
		const endpointId = `endpoint${(originalIndex + 1).toString()}`;

		return Promise.race([
			fetchEndpointSchema(endpoint, originalIndex, hfToken),
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
				(error: unknown): EndpointConnectionResult => {
					logger.error({
						endpointId,
						subdomain: endpoint.subdomain,
						error: error instanceof Error ? error.message : String(error),
					}, 'Failed to fetch schema from endpoint');
					return {
						success: false,
						endpointId,
						error: error instanceof Error ? error : new Error(String(error)),
					};
				}
			);
	});

	// Execute all schema fetches in parallel
	const results = await Promise.all(schemaFetchTasks);

	// Log results
	const successful = results.filter((r) => r.success);
	const failed = results.filter((r) => !r.success);

	logger.debug(
		{
			total: results.length,
			successful: successful.length,
			failed: failed.length,
		},
		'Gradio endpoint schema fetch results'
	);

	// Log failed endpoints separately for debugging
	if (failed.length > 0) {
		failed.forEach((f) => {
			logger.error({
				endpointId: f.endpointId,
				error: f.error.message,
			}, 'Endpoint schema fetch failed');
		});
	}

	return results;
}

/**
 * Creates SSE connection to endpoint when needed for tool execution
 */
async function createLazyConnection(
	sseUrl: string,
	hfToken: string | undefined
): Promise<Client> {
	logger.debug({ url: sseUrl }, 'Creating lazy SSE connection for tool execution');

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

		logger.debug('Including HF token in lazy SSE connection');
	}
	const transport = new SSEClientTransport(new URL(sseUrl), transportOptions);

	// Connect the client to the transport
	await remoteClient.connect(transport);
	logger.debug('Lazy SSE connection established');

	return remoteClient;
}

/**
 * Registers a remote tool from a Gradio endpoint
 */
export function registerRemoteTool(
	server: McpServer,
	endpointId: string,
	originalIndex: number,
	_client: Client | null,
	tool: Tool,
	name?: string,
	emoji?: string,
	sseUrl?: string,
	hfToken?: string
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
				// Since we use schema fetch, we always need to create SSE connection for tool execution
				if (!sseUrl) {
					throw new Error('No SSE URL available for tool execution');
				}
				logger.debug({ tool: tool.name }, 'Creating SSE connection for tool execution');
				const activeClient = await createLazyConnection(sseUrl, hfToken);

				const result = await activeClient.request(
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
				logger.error({ tool: tool.name, error }, 'Remote tool call failed');
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
export function convertJsonSchemaToZod(jsonSchemaProperty: JsonSchemaProperty, skipDefault = false): z.ZodTypeAny {
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
