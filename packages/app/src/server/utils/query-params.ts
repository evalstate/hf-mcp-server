import type { Request } from 'express';

/**
 * Extracts supported query parameters from the request and sets corresponding headers
 * This centralizes the logic for converting URL query parameters to internal headers
 * used by the tool selection strategy.
 */
export function extractQueryParamsToHeaders(req: Request, headers: Record<string, string>): void {
	const bouquet = req.query.bouquet as string | undefined;
	const mix = req.query.mix as string | undefined;
	const gradio = req.query.gradio as string | undefined;
	const forceauth = req.query.forceauth as string | undefined;
	const login = req.query.login;
	const auth = req.query.auth;

	if (bouquet) {
		headers['x-mcp-bouquet'] = bouquet;
	}
	if (mix) {
		headers['x-mcp-mix'] = mix;
	}
	if (gradio) {
		headers['x-mcp-gradio'] = gradio;
	}

	// Check if forceauth, login, or auth appears in the URL (with or without values)
	if (forceauth || login !== undefined || auth !== undefined) {
		headers['x-mcp-force-auth'] = 'true';
	}
}
