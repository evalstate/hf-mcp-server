import { logger } from '../utils/logger.js';

/**
 * Extracts HF token, bouquet, and mix from headers and environment
 */
export function extractAuthBouquetAndMix(headers: Record<string, string> | null): {
	hfToken: string | undefined;
	bouquet: string | undefined;
	mix: string | undefined;
} {
	let tokenFromHeader: string | undefined;
	let bouquet: string | undefined;
	let mix: string | undefined;

	if (headers) {
		// Extract token from Authorization header
		if ('authorization' in headers) {
			const authHeader = headers.authorization || '';
			if (authHeader.startsWith('Bearer ')) {
				tokenFromHeader = authHeader.slice(7).trim();
			}
		}

		// Extract bouquet from custom header
		if ('x-mcp-bouquet' in headers) {
			bouquet = headers['x-mcp-bouquet'];
			logger.trace({ bouquet }, 'Bouquet parameter received');
		}

		// Extract mix from custom header
		if ('x-mcp-mix' in headers) {
			mix = headers['x-mcp-mix'];
			logger.trace({ mix }, 'Mix parameter received');
		}
	}

	// Use token from header if available, otherwise fall back to environment
	const hfToken = tokenFromHeader || process.env.DEFAULT_HF_TOKEN;

	return { hfToken, bouquet, mix };
}
