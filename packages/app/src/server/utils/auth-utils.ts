import { logger } from '../lib/logger.js';

/**
 * Extracts HF token and bouquet from headers and environment
 */
export function extractAuthAndBouquet(headers: Record<string, string> | null): {
	hfToken: string | undefined;
	bouquet: string | undefined;
} {
	let tokenFromHeader: string | undefined;
	let bouquet: string | undefined;

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
			logger.info({ bouquet }, 'Bouquet parameter received');
		}
	}

	// Use token from header if available, otherwise fall back to environment
	const hfToken = tokenFromHeader || process.env.DEFAULT_HF_TOKEN;

	return { hfToken, bouquet };
}