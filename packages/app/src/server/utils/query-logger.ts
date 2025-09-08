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
		console.warn('[System Logger] System logging disabled: No HF token found (set LOGGING_HF_TOKEN or DEFAULT_HF_TOKEN)');
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
	}
): void {
	if (!systemLogger) {
		return;
	}

	const mcpServerSessionId = getMcpServerSessionId();
	systemLogger.info({
		query: sessionId, // Use sessionId as the "query" for system events
		methodName,
		parameters: JSON.stringify({ sessionId }),
		resultsShared: -1,
		totalResults: -1,
		responseCharCount: -1,
		requestJson: options?.requestJson ? JSON.stringify(options.requestJson) : JSON.stringify({ methodName, sessionId }),
		isAuthenticated: options?.isAuthenticated ?? false,
		name: options?.clientName || null,
		version: options?.clientVersion || null,
		clientSessionId: options?.clientSessionId || null,
		mcpServerSessionId,
	});
}

export { queryLogger };
