/**
 * Shared constants for the HF-MCP-Server application
 */

// Transport types
export type TransportType = 'stdio' | 'sse' | 'streamableHttp' | 'streamableHttpJson' | 'unknown';

// Server port (now using single port for both web app and MCP API)
export const DEFAULT_WEB_APP_PORT = 3000;