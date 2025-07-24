import { logQuery } from './query-logger.js';

/**
 * Creates a wrapper function that adds query logging to search tool methods
 */
export function withQueryLogging<T extends unknown[], R>(
	originalMethod: (...args: T) => Promise<R>,
	toolName: string,
	extractQuery: (...args: T) => string,
	extractParams: (...args: T) => Record<string, unknown>
) {
	return async (...args: T): Promise<R> => {
		const query = extractQuery(...args);
		const params = extractParams(...args);
		
		try {
			const result = await originalMethod(...args);
			
			// Log successful query
			logQuery({
				query,
				toolName,
				parameters: JSON.stringify(params),
				status: 'success',
			});
			
			return result;
		} catch (error) {
			// Log failed query
			logQuery({
				query,
				toolName,
				parameters: JSON.stringify(params),
				status: 'error',
				error: error instanceof Error ? error.message : String(error),
			});
			
			throw error;
		}
	};
}