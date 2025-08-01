import { pino, type Logger } from 'pino';
import type { LoggerOptions } from 'pino';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Query logging should always log when enabled, regardless of main app log level
const queryLoggingEnabled = !!process.env.QUERY_DATASET_ID;

// Get the current file's directory in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Structure for query logs - consistent fields for HF dataset viewer
 */
export interface QueryLogEntry {
	query: string;
	toolName: string;
	parameters: string; // JSON string of parameters for consistent format
	sessionId: string;
	timestamp: string;
	status: 'success' | 'error';
	error?: string;
}

function createQueryLogger(): Logger | null {
	// Disable during tests
	if (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') {
		return null;
	}

	if (!queryLoggingEnabled) {
		return null;
	}

	const datasetId = process.env.QUERY_DATASET_ID;
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

/**
 * Log a search query with consistent structure
 */
export function logQuery(entry: Omit<QueryLogEntry, 'sessionId' | 'timestamp'>): void {
	if (!queryLogger) {
		return;
	}

	const logEntry: QueryLogEntry = {
		...entry,
		sessionId: crypto.randomUUID(),
	};

	queryLogger.info(logEntry);
}

/**
 * Simple helper to log successful search queries
 */
export function logSearchQuery(toolName: string, query: string, data: Record<string, unknown>): void {
	logQuery({
		query,
		toolName,
		parameters: JSON.stringify(data),
		status: 'success',
	});
}

/**
 * Simple helper to log prompts (model details, dataset details, user/paper summaries)
 */
export function logPromptQuery(toolName: string, query: string, data: Record<string, unknown>): void {
	logQuery({
		query,
		toolName,
		parameters: JSON.stringify(data),
		status: 'success',
	});
}

export { queryLogger };
