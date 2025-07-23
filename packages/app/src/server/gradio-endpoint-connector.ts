import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport, type SSEClientTransportOptions } from '@modelcontextprotocol/sdk/client/sse.js';
import {
	CallToolResultSchema,
	type ServerNotification,
	type ServerRequest,
	type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RequestHandlerExtra, RequestOptions } from '@modelcontextprotocol/sdk/shared/protocol.js';
import { logger } from './utils/logger.js';
import { z } from 'zod';
import type { GradioEndpoint } from './utils/mcp-api-client.js';
import { spaceInfo } from '@huggingface/hub';
import { gradioMetrics, getMetricsSafeName } from './utils/gradio-metrics.js';
import { createGradioToolName } from './utils/gradio-utils.js';

// Define types for JSON Schema
interface JsonSchemaProperty {
	type?: string;
	description?: string;
	default?: unknown;
	enum?: unknown[];
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
	tools: Tool[];
	name?: string;
	emoji?: string;
	sseUrl?: string; // Store the SSE URL for lazy connection during tool calls
	isPrivate?: boolean;
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
): Array<{ name: string; description?: string; inputSchema: JsonSchema }> {
	// Handle both array and object schema formats
	let tools: Array<{ name: string; description?: string; inputSchema: JsonSchema }> = [];

	if (Array.isArray(schemaResponse)) {
		// NEW-- Array format: [{ name: "toolName", description: "...", inputSchema: {...} }, ...]
		tools = (schemaResponse as ArrayFormatTool[]).filter(
			(tool): tool is ArrayFormatTool =>
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
				tools: tools.map((t) => t.name),
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
				tools: tools.map((t) => t.name),
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

	return tools;
}

/**
 * Check if a space is private by fetching its info
 */

async function isSpacePrivate(spaceName: string, hfToken?: string): Promise<boolean> {
	try {
		if (!hfToken) return false; // anonymous requests don't have a token to forward
		const info = await spaceInfo({ name: spaceName, credentials: { accessToken: hfToken } });
		return info.private;
	} catch (error) {
		// If we can't fetch space info, assume it might be private to be safe
		logger.warn({ spaceName, error }, 'Failed to fetch space info, assuming private');
		return true;
	}
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

	// TODO -- leaving this commented out for now -- i may want this again very shortly
	const isPrivateSpace = await isSpacePrivate(endpoint.name, hfToken);
	logger.debug({ url: schemaUrl, endpointId }, 'Fetching schema from endpoint');

	// Prepare headers
	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
	};

	if (isPrivateSpace && hfToken) {
		headers['X-HF-Authorization'] = `Bearer ${hfToken}`;
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
		logger.error(
			{
				endpointId,
				subdomain: endpoint.subdomain,
				status: response.status,
				statusText: response.statusText,
			},
			'Failed to fetch schema from endpoint'
		);
		throw new Error(`Failed to fetch schema: ${response.status} ${response.statusText}`);
	}

	const schemaResponse = (await response.json()) as unknown;

	// Parse the schema response
	const parsed = parseSchemaResponse(schemaResponse, endpointId, endpoint.subdomain);
	const tools: Tool[] = parsed
		.filter((parsedTool) => !parsedTool.name.toLowerCase().includes('<lambda'))
		.map((parsedTool) => ({
			name: parsedTool.name,
			description: parsedTool.description || `${parsedTool.name} tool`,
			inputSchema: {
				type: 'object',
				properties: parsedTool.inputSchema.properties || {},
				required: parsedTool.inputSchema.required || [],
				description: parsedTool.inputSchema.description,
			},
		}));

	return {
		endpointId,
		originalIndex,
		client: null, // No client connection yet
		tools: tools,
		name: endpoint.name,
		emoji: endpoint.emoji,
		sseUrl: `https://${endpoint.subdomain}.hf.space/gradio_api/mcp/sse`, // Store SSE URL for later
		isPrivate: isPrivateSpace,
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

		return Promise.race([fetchEndpointSchema(endpoint, originalIndex, hfToken), createTimeout(CONNECTION_TIMEOUT_MS)])
			.then(
				(connection): EndpointConnectionResult => ({
					success: true,
					endpointId,
					connection,
				})
			)
			.catch((error: unknown): EndpointConnectionResult => {
				const log = gradioMetrics.schemaFetchError(endpoint.name);
				if (log) {
					logger.error(
						{
							endpointId,
							subdomain: endpoint.subdomain,
							error: error instanceof Error ? error.message : String(error),
						},
						'Failed to fetch schema from endpoint'
					);
				}
				return {
					success: false,
					endpointId,
					error: error instanceof Error ? error : new Error(String(error)),
				};
			});
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

	return results;
}

/**
 * Creates SSE connection to endpoint when needed for tool execution
 */
async function createLazyConnection(sseUrl: string, hfToken: string | undefined): Promise<Client> {
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
		const headerName = 'X-HF-Authorization';
		const customHeaders = {
			[headerName]: `Bearer ${hfToken}`,
		};
		logger.trace(`connection to gradio endpoint with ${headerName} header`);
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
	}
	logger.debug(`MCP Client connection contains token? (${undefined != hfToken})`);
	const transport = new SSEClientTransport(new URL(sseUrl), transportOptions);

	// Connect the client to the transport
	await remoteClient.connect(transport);
	logger.debug('Lazy SSE connection established');

	return remoteClient;
}

/**
 * Creates the display information for a tool
 */
function createToolDisplayInfo(connection: EndpointConnection, tool: Tool): { title: string; description: string } {
	const displayName = connection.name || 'Unknown Space';
	const title = `${displayName} - ${tool.name}${connection.emoji ? ` ${connection.emoji}` : ''}`;
	const description = tool.description
		? `${tool.description} (from ${displayName})`
		: `${tool.name} tool from ${displayName}`;
	return { title, description };
}

/**
 * Creates the tool handler function
 */
function createToolHandler(
	connection: EndpointConnection,
	tool: Tool,
	outwardFacingName: string,
	hfToken?: string
): (
	params: Record<string, unknown>,
	extra: RequestHandlerExtra<ServerRequest, ServerNotification>
) => Promise<typeof CallToolResultSchema._type> {
	return async (params: Record<string, unknown>, extra) => {
		logger.info({ tool: tool.name, params }, 'Calling remote tool');
		try {
			// Since we use schema fetch, we always need to create SSE connection for tool execution
			if (!connection.sseUrl) {
				throw new Error('No SSE URL available for tool execution');
			}
			logger.debug({ tool: tool.name }, 'Creating SSE connection for tool execution');
			const activeClient = await createLazyConnection(connection.sseUrl, hfToken);

			// Check if the client is requesting progress notifications
			const progressToken = extra._meta?.progressToken;
			const requestOptions: RequestOptions = {};

			if (progressToken !== undefined) {
				logger.debug({ tool: tool.name, progressToken }, 'Progress notifications requested');

				// Set up progress relay from remote tool to our client
				requestOptions.onprogress = async (progress) => {
					logger.trace({ tool: tool.name, progressToken, progress }, 'Relaying progress notification');

					// Relay the progress notification to our client
					await extra.sendNotification({
						method: 'notifications/progress',
						params: {
							progressToken,
							progress: progress.progress,
							total: progress.total,
							message: progress.message,
						},
					});
				};
			}

			const result = await activeClient.request(
				{
					method: 'tools/call',
					params: {
						name: tool.name,
						arguments: params,
						_meta: progressToken !== undefined ? { progressToken } : undefined,
					},
				},
				CallToolResultSchema,
				requestOptions
			);
			// For metrics, use the safe name utility
			const metricsName = getMetricsSafeName(outwardFacingName);

			if (result.isError) {
				logger.warn({ tool: tool.name, error: result.content }, 'Gradio tool call returned error');
				gradioMetrics.recordFailure(metricsName);
			} else {
				logger.debug({ tool: tool.name }, 'Gradio tool call completed successfully');
				gradioMetrics.recordSuccess(metricsName);
			}
			return result;
		} catch (error) {
			// this is a
			logger.error({ tool: tool.name, error }, 'Remote tool call failed');
			// For metrics, use the safe name utility
			const metricsName = getMetricsSafeName(outwardFacingName);
			gradioMetrics.recordFailure(metricsName);
			throw error;
		}
	};
}

/**
 * Registers multiple remote tools from a Gradio endpoint
 */
export function registerRemoteTools(server: McpServer, connection: EndpointConnection, hfToken?: string): void {
	for (const tool of connection.tools) {
		// Generate tool name
		const outwardFacingName = createGradioToolName(tool.name, connection.originalIndex, connection.isPrivate);

		// Create display info
		const { title, description } = createToolDisplayInfo(connection, tool);

		// Convert schema
		const schemaShape = convertToolSchemaToZod(tool);

		// Create handler
		const handler = createToolHandler(connection, tool, outwardFacingName, hfToken);

		// Log registration
		logger.trace(
			{
				endpointId: connection.endpointId,
				originalName: tool.name,
				outwardFacingName: outwardFacingName,
				description: tool.description,
			},
			'Registering remote tool'
		);

		// Log the exact structure we're getting
		logger.trace(
			{
				toolName: tool.name,
				inputSchema: tool.inputSchema,
			},
			'Remote tool inputSchema structure'
		);

		// Register the tool
		server.tool(
			outwardFacingName,
			description,
			schemaShape,
			{
				openWorldHint: true,
				title: title,
			},
			handler
		);
	}
}

function convertToolSchemaToZod(tool: Tool): Record<string, z.ZodTypeAny> {
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

	return schemaShape;
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
	} else if (jsonSchemaProperty.enum && Array.isArray(jsonSchemaProperty.enum) && jsonSchemaProperty.enum.length > 0) {
		// Handle enum types
		if (jsonSchemaProperty.enum.every((v): v is string => typeof v === 'string')) {
			const enumValues = jsonSchemaProperty.enum as [string, ...string[]];
			zodSchema = z.enum(enumValues);
		} else {
			// Fallback for non-string enums - create a union of literals
			const literals: z.ZodTypeAny[] = jsonSchemaProperty.enum.map((v) => {
				if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' || v === null) {
					return z.literal(v);
				}
				// For other types, convert to string
				return z.literal(String(v));
			});

			if (literals.length === 1) {
				// We know literals[0] exists because we checked length === 1
				zodSchema = literals[0] ?? z.any();
			} else if (literals.length >= 2) {
				// Ensure we have at least 2 elements for union
				zodSchema = z.union(literals as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]);
			} else {
				// This shouldn't happen due to our length check, but handle it anyway
				zodSchema = z.any();
			}
		}
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
			: 'a http or https url to a file';
	}

	if (description) {
		zodSchema = zodSchema.describe(description);
	}

	// Apply default value from the Schema
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
