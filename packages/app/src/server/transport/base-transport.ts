import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Express } from 'express';

export interface TransportOptions {
	port?: number;
}

/**
 * Standardized session metadata structure for all transports
 */
export interface SessionMetadata {
	id: string;
	connectedAt: Date;
	lastActivity: Date;
	clientInfo?: {
		name: string;
		version: string;
	};
	capabilities: {
		sampling?: boolean;
		tools?: boolean;
		resources?: boolean;
	};
}

/**
 * Standardized session info for monitoring APIs
 */
export interface SessionInfo {
	id: string;
	connectedAt: string;
	lastActivity: string;
	timeSinceActivity: number;
	clientInfo?: SessionMetadata['clientInfo'];
	capabilities: SessionMetadata['capabilities'];
}

/**
 * Base class for all transport implementations
 */
export abstract class BaseTransport {
	protected server: McpServer;
	protected app: Express;

	constructor(server: McpServer, app: Express) {
		this.server = server;
		this.app = app;
	}

	/**
	 * Initialize the transport with the given options
	 */
	abstract initialize(options: TransportOptions): Promise<void>;

	/**
	 * Clean up the transport resources
	 */
	abstract cleanup(): Promise<void>;

	/**
	 * Mark transport as shutting down
	 * Optional method for transports that need to reject new connections
	 */
	shutdown?(): void;

	/**
	 * Get active sessions with standardized metadata
	 * Optional for transports that don't manage sessions
	 */
	getActiveSessions?(): SessionInfo[];

	/**
	 * Get the number of active connections
	 * Optional for transports that don't manage sessions
	 */
	getActiveConnectionCount?(): number;
}
