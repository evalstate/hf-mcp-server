import { logQuery } from './query-logger.js';
import { randomUUID } from 'crypto';

// Stable session ID for this MCP server instance
const mcpServerSessionId = randomUUID();

/**
 * Creates a wrapper function that adds query logging to search tool methods
 */
export function withQueryLogging<T extends unknown[], R>(
	originalMethod: (...args: T) => Promise<R>,
	methodName: string,
	extractQuery: (...args: T) => string,
	extractParams: (...args: T) => Record<string, unknown>,
	getLoggingOptions?: () => {
		clientSessionId?: string;
		isAuthenticated?: boolean;
		clientName?: string;
		clientVersion?: string;
	}
) {
	return async (...args: T): Promise<R> => {
		const query = extractQuery(...args);
		const params = extractParams(...args);
		const loggingOptions = getLoggingOptions ? getLoggingOptions() : {};
		
		try {
			const result = await originalMethod(...args);
			
			// Calculate response metrics
			let totalResults = 0;
			let responseCharCount = 0;
			
			if (result && typeof result === 'object') {
				// Try to count results if it's an array or has a results property
				if (Array.isArray(result)) {
					totalResults = result.length;
				} else if (result && typeof result === 'object' && 'results' in result) {
					const resultWithArray = result as { results: unknown };
					if (Array.isArray(resultWithArray.results)) {
						totalResults = resultWithArray.results.length;
					}
				}
				
				// Calculate character count of response
				responseCharCount = JSON.stringify(result).length;
			}
			
			// Log successful query
			logQuery({
				query,
				methodName,
				parameters: JSON.stringify(params),
				requestJson: JSON.stringify({ methodName, query, ...params }),
				mcpServerSessionId,
				totalResults,
				responseCharCount,
				clientSessionId: loggingOptions.clientSessionId || null,
				isAuthenticated: loggingOptions.isAuthenticated ?? false,
				name: loggingOptions.clientName || null,
				version: loggingOptions.clientVersion || null,
			});
			
			return result;
		} catch (error) {
			// Log failed query
			logQuery({
				query,
				methodName,
				parameters: JSON.stringify(params),
				requestJson: JSON.stringify({ methodName, query, ...params }),
				mcpServerSessionId,
				clientSessionId: loggingOptions.clientSessionId || null,
				isAuthenticated: loggingOptions.isAuthenticated ?? false,
				name: loggingOptions.clientName || null,
				version: loggingOptions.clientVersion || null,
			});
			
			throw error;
		}
	};
}