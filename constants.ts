/**
 * Shared constants for the HF-MCP-Server application
 */

// Transport types
export type TransportType = 'stdio' | 'sse' | 'streamableHttp' | 'unknown';

// Server ports
export const DEFAULT_MCP_PORT = 3001;
export const DEFAULT_WEB_APP_PORT = 3000;