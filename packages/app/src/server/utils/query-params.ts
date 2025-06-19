import type { Request } from 'express';
import { logger } from '../lib/logger.js';

/**
 * Extracts supported query parameters from the request and sets corresponding headers
 * This centralizes the logic for converting URL query parameters to internal headers
 * used by the tool selection strategy.
 */
export function extractQueryParamsToHeaders(req: Request, headers: Record<string, string>): void {
	const bouquet = req.query.bouquet as string | undefined;
	const mix = req.query.mix as string | undefined;
	const forceauth = req.query.forceauth as string | undefined;

	if (bouquet) {
		headers['x-mcp-bouquet'] = bouquet;
	}
	if (mix) {
		headers['x-mcp-mix'] = mix;
	}

	if (forceauth) {
		headers['x-mcp-force-auth'] = 'true';
		logger.error('FORCED AUTH TRUE');
	}
}
