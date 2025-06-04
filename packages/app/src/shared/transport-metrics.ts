import type { TransportType } from './constants.js';

/**
 * Core metrics data tracked by each transport
 */
export interface TransportMetrics {
	startupTime: Date;
	
	// Connection metrics
	connections: {
		active: number | 'stateless';
		total: number;
		cleaned?: number; // Only for stateful transports
	};
	
	// Request metrics
	requests: {
		total: number;
		averagePerMinute: number;
	};
	
	// Error metrics
	errors: {
		expected: number; // 4xx errors
		unexpected: number; // 5xx errors
		lastError?: {
			type: string;
			message: string;
			timestamp: Date;
		};
	};
	
	// Client identity aggregation (name@version)
	clients: Map<string, ClientMetrics>;
}

/**
 * Metrics per client identity (name@version)
 */
export interface ClientMetrics {
	name: string;
	version: string;
	requestCount: number;
	firstSeen: Date;
	lastSeen: Date;
	isConnected: boolean;
	activeConnections: number;
	totalConnections: number;
}

/**
 * API response format for transport metrics
 */
export interface TransportMetricsResponse {
	transport: TransportType;
	isStateless: boolean;
	startupTime: string; // ISO date string
	currentTime: string; // ISO date string
	uptimeSeconds: number;
	
	// Configuration settings (only for stateful transports)
	configuration?: {
		staleCheckInterval: number; // milliseconds
		staleTimeout: number; // milliseconds
	};
	
	connections: {
		active: number | 'stateless';
		total: number;
		cleaned?: number;
	};
	
	requests: {
		total: number;
		averagePerMinute: number;
	};
	
	errors: {
		expected: number;
		unexpected: number;
		lastError?: {
			type: string;
			message: string;
			timestamp: string; // ISO date string
		};
	};
	
	clients: Array<{
		name: string;
		version: string;
		requestCount: number;
		firstSeen: string; // ISO date string
		lastSeen: string; // ISO date string
		isConnected: boolean;
		activeConnections: number;
		totalConnections: number;
	}>;
}

/**
 * Convert internal metrics to API response format
 */
export function formatMetricsForAPI(
	metrics: TransportMetrics,
	transport: TransportType,
	isStateless: boolean
): TransportMetricsResponse {
	const currentTime = new Date();
	const uptimeSeconds = Math.floor((currentTime.getTime() - metrics.startupTime.getTime()) / 1000);
	
	return {
		transport,
		isStateless,
		startupTime: metrics.startupTime.toISOString(),
		currentTime: currentTime.toISOString(),
		uptimeSeconds,
		connections: metrics.connections,
		requests: metrics.requests,
		errors: {
			...metrics.errors,
			lastError: metrics.errors.lastError ? {
				...metrics.errors.lastError,
				timestamp: metrics.errors.lastError.timestamp.toISOString()
			} : undefined
		},
		clients: Array.from(metrics.clients.values()).map(client => ({
			...client,
			firstSeen: client.firstSeen.toISOString(),
			lastSeen: client.lastSeen.toISOString()
		}))
	};
}

/**
 * Create a new empty metrics object
 */
export function createEmptyMetrics(): TransportMetrics {
	return {
		startupTime: new Date(),
		connections: {
			active: 0,
			total: 0
		},
		requests: {
			total: 0,
			averagePerMinute: 0
		},
		errors: {
			expected: 0,
			unexpected: 0
		},
		clients: new Map()
	};
}

/**
 * Get client identity key from name and version
 */
export function getClientKey(name: string, version: string): string {
	return `${name}@${version}`;
}