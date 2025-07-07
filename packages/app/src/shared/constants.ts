/**
 * Shared constants for the HF-MCP-Server application
 */

// Transport types
export type TransportType = 'stdio' | 'sse' | 'streamableHttp' | 'streamableHttpJson' | 'unknown';

export const OAUTH_RESOURCE =
	'Bearer resource_metadata="https://huggingface.co/.well-known/oauth-protected-resource/mcp"';

// Server port (now using single port for both web app and MCP API)
export const DEFAULT_WEB_APP_PORT = 3000;

/** make this referenceable */
export const GRADIO_PREFIX = 'gr';
export const GRADIO_PRIVATE_PREFIX = 'grp';
