import pino, { type Logger, type LoggerOptions } from 'pino';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Feature flags: enable/disable per-log-type; defaults to true
const QUERY_LOGS_ENABLED = (process.env.LOG_QUERY_EVENTS ?? 'true').toLowerCase() === 'true';
const SYSTEM_LOGS_ENABLED = (process.env.LOG_SYSTEM_EVENTS ?? 'true').toLowerCase() === 'true';
const DATASET_CONFIGURED = !!process.env.LOGGING_DATASET_ID;

// Get the current file's directory in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Structure for query logs - consistent fields for HF dataset viewer
 */
export interface QueryLogEntry {
	mcpServerSessionId: string; // MCP Server to Dataset connection
	clientSessionId?: string | null; // Client to MCP Server connection
	name?: string | null; // ClientInfo.name
	version?: string | null; // ClientInfo.version
	methodName: string;
	query: string;
	parameters: string; // JSON string of parameters for consistent format
	// SessionMetadata fields
	isAuthenticated?: boolean;
	// Response information
	totalResults?: number;
	resultsShared?: number;
	responseCharCount?: number;
	requestJson?: string; // Full JSON of the request
}

function createQueryLogger(): Logger | null {
	// Disable during tests
	if (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') {
		return null;
	}

	if (!QUERY_LOGS_ENABLED || !DATASET_CONFIGURED) {
		return null;
	}

	const datasetId = process.env.LOGGING_DATASET_ID;
	const hfToken = process.env.LOGGING_HF_TOKEN || process.env.DEFAULT_HF_TOKEN;

	if (!hfToken) {
		console.warn('[Query Logger] Query logging disabled: No HF token found (set LOGGING_HF_TOKEN or DEFAULT_HF_TOKEN)');
		return null;
	}

	console.log(`[Query Logger] Query logging enabled for dataset: ${datasetId}`);

	try {
		const transportPath = join(__dirname, 'hf-dataset-transport.js');

		const baseOptions: LoggerOptions = {
			level: 'info', // Always log queries when enabled
			timestamp: pino.stdTimeFunctions.isoTime,
		};

		// Only log to HF dataset, no console output for queries
		return pino({
			...baseOptions,
			transport: {
				target: transportPath,
				options: { sync: false, logType: 'Query' },
			},
		});
	} catch (error) {
		console.error('[Query Logger] Failed to setup query logging transport:', error);
		return null;
	}
}

const queryLogger: Logger | null = createQueryLogger();

function createSystemLogger(): Logger | null {
	// Disable during tests
	if (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') {
		return null;
	}

	// Require a dataset
	if (!DATASET_CONFIGURED) {
		return null;
	}

	if (!SYSTEM_LOGS_ENABLED) {
		return null;
	}

	const hfToken = process.env.LOGGING_HF_TOKEN || process.env.DEFAULT_HF_TOKEN;
	if (!hfToken) {
		console.warn(
			'[System Logger] System logging disabled: No HF token found (set LOGGING_HF_TOKEN or DEFAULT_HF_TOKEN)'
		);
		return null;
	}

	try {
		const transportPath = join(__dirname, 'hf-dataset-transport.js');
		const baseOptions: LoggerOptions = {
			level: 'info',
			timestamp: pino.stdTimeFunctions.isoTime,
		};
		return pino({
			...baseOptions,
			transport: {
				target: transportPath,
				options: { sync: false, logType: 'System' },
			},
		});
	} catch (error) {
		console.error('[System Logger] Failed to setup system logging transport:', error);
		return null;
	}
}

const systemLogger: Logger | null = createSystemLogger();

function createGradioLogger(): Logger | null {
	// Disable during tests
	if (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') {
		return null;
	}

	// Require a dataset
	if (!DATASET_CONFIGURED) {
		return null;
	}

	if (!SYSTEM_LOGS_ENABLED) {
		return null;
	}

	const hfToken = process.env.LOGGING_HF_TOKEN || process.env.DEFAULT_HF_TOKEN;
	if (!hfToken) {
		console.warn(
			'[Gradio Logger] Gradio logging disabled: No HF token found (set LOGGING_HF_TOKEN or DEFAULT_HF_TOKEN)'
		);
		return null;
	}

	try {
		const transportPath = join(__dirname, 'hf-dataset-transport.js');
		const baseOptions: LoggerOptions = {
			level: 'info',
			timestamp: pino.stdTimeFunctions.isoTime,
		};
		return pino({
			...baseOptions,
			transport: {
				target: transportPath,
				options: { sync: false, logType: 'Gradio' },
			},
		});
	} catch (error) {
		console.error('[Gradio Logger] Failed to setup Gradio logging transport:', error);
		return null;
	}
}

const gradioLogger: Logger | null = createGradioLogger();

// Stable session ID for this MCP server instance (process lifetime)
const mcpServerSessionId = crypto.randomUUID();

function getMcpServerSessionId(): string {
	return mcpServerSessionId;
}

/**
 * Log a search query with consistent structure
 */
export function logQuery(entry: QueryLogEntry): void {
	if (!queryLogger) {
		return;
	}

	queryLogger.info(entry);
}

/**
 * Simple helper to log successful search queries
 */
export function logSearchQuery(
	methodName: string,
	query: string,
	data: Record<string, unknown>,
	options?: {
		clientSessionId?: string;
		isAuthenticated?: boolean;
		clientName?: string;
		clientVersion?: string;
		totalResults?: number;
		resultsShared?: number;
		responseCharCount?: number;
	}
): void {
	// Use a stable mcpServerSessionId per process/transport instance
	const mcpServerSessionId = getMcpServerSessionId();

	logQuery({
		query,
		methodName,
		parameters: JSON.stringify(data),
		requestJson: JSON.stringify({ methodName, query, ...data }),
		mcpServerSessionId,
		clientSessionId: options?.clientSessionId || null,
		isAuthenticated: options?.isAuthenticated ?? false,
		name: options?.clientName || null,
		version: options?.clientVersion || null,
		totalResults: options?.totalResults,
		resultsShared: options?.resultsShared,
		responseCharCount: options?.responseCharCount,
	});
}

/**
 * Simple helper to log prompts (model details, dataset details, user/paper summaries)
 */
export function logPromptQuery(
	methodName: string,
	query: string,
	data: Record<string, unknown>,
	options?: {
		clientSessionId?: string;
		isAuthenticated?: boolean;
		clientName?: string;
		clientVersion?: string;
		totalResults?: number;
		resultsShared?: number;
		responseCharCount?: number;
	}
): void {
	// Use a stable mcpServerSessionId per process/transport instance
	const mcpServerSessionId = getMcpServerSessionId();

	logQuery({
		query,
		methodName,
		parameters: JSON.stringify(data),
		requestJson: JSON.stringify({ methodName, query, ...data }),
		mcpServerSessionId,
		clientSessionId: options?.clientSessionId || null,
		isAuthenticated: options?.isAuthenticated ?? false,
		name: options?.clientName || null,
		version: options?.clientVersion || null,
		totalResults: options?.totalResults,
		resultsShared: options?.resultsShared,
		responseCharCount: options?.responseCharCount,
	});
}

/**
 * Simple helper to log system events (initialize, session_delete)
 */
export function logSystemEvent(
	methodName: string,
	sessionId: string,
	options?: {
		clientSessionId?: string;
		isAuthenticated?: boolean;
		clientName?: string;
		clientVersion?: string;
		requestJson?: unknown;
		capabilities?: unknown;
	}
): void {
	if (!systemLogger) {
		return;
	}

	const mcpServerSessionId = getMcpServerSessionId();

	// Extract name and version from capabilities if available
	let capabilitiesName = null;
	let capabilitiesVersion = null;
	if (options?.capabilities && typeof options.capabilities === 'object' && options.capabilities !== null) {
		const caps = options.capabilities as Record<string, unknown>;
		if (caps.clientInfo && typeof caps.clientInfo === 'object' && caps.clientInfo !== null) {
			const clientInfo = caps.clientInfo as Record<string, unknown>;
			capabilitiesName = typeof clientInfo.name === 'string' ? clientInfo.name : null;
			capabilitiesVersion = typeof clientInfo.version === 'string' ? clientInfo.version : null;
		}
	}

	systemLogger.info(
		{
			// Core session tracking fields (no level/message - they are redundant)
			sessionId, // Direct session ID field instead of using "query"
			methodName, // Direct method name field

			// Authorization status

			// Client info fields as separate columns
			name: options?.clientName || capabilitiesName || null,
			version: options?.clientVersion || capabilitiesVersion || null,
			authorized: options?.isAuthenticated ?? false, // renamed from isAuthenticated

			// Full request data for context
			capabilities: options?.capabilities ? JSON.stringify(options.capabilities) : null,
			clientSessionId: options?.clientSessionId || null,
			requestJson: options?.requestJson
				? JSON.stringify(options.requestJson)
				: JSON.stringify({ methodName, sessionId }),
			mcpServerSessionId,
		},
		'System event logged'
	);
}

/**
 * Log Gradio API calls with timing, success/error status, and response size
 */
export function logGradioEvent(
	endpointName: string,
	sessionId: string,
	options: {
		durationMs: number;
		isAuthenticated?: boolean;
		clientName?: string;
		clientVersion?: string;
		success: boolean;
		error?: string;
		responseSizeBytes?: number;
		notificationCount?: number;
	}
): void {
	if (!gradioLogger) {
		return;
	}

	const mcpServerSessionId = getMcpServerSessionId();

	gradioLogger.info(
		{
			sessionId,
			endpointName, // e.g., "user/repo"
			name: options.clientName || null,
			version: options.clientVersion || null,
			authorized: options.isAuthenticated ?? false,
			durationMs: options.durationMs,
			success: options.success,
			error: options.error || null,
			responseSizeBytes: options.responseSizeBytes || null,
			notificationCount: options.notificationCount || 0,
			mcpServerSessionId,
		},
		'Gradio event logged'
	);
}

export { queryLogger };
