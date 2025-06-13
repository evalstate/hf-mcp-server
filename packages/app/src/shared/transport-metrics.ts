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
		authenticated: number;
		denied: number;
		anonymous: number;
		cleaned?: number; // Only for stateful transports
	};

	// Request metrics
	requests: {
		total: number;
		averagePerMinute: number;
	};

	// Ping metrics (for stateful transports)
	pings?: {
		sent: number;
		successful: number;
		failed: number;
		lastPingTime?: Date;
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

	// Client identity aggregation (name version)
	clients: Map<string, ClientMetrics>;

	// Method metrics
	methods: Map<string, MethodMetrics>;

	// Static page hits (for stateless transport)
	staticPageHits200?: number;
	staticPageHits405?: number;
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
 * Metrics per MCP method
 */
export interface MethodMetrics {
	method: string;
	count: number;
	firstCalled: Date;
	lastCalled: Date;
	averageResponseTime?: number;
	errors: number;
}

/**
 * API call metrics for external HuggingFace API calls
 */
export interface ApiCallMetrics {
	anonymous: number;
	authenticated: number;
	unauthorized: number; // 401
	forbidden: number; // 403
}

/**
 * API response format for transport metrics
 */
export interface SessionData {
	id: string;
	connectedAt: string; // ISO date string
	lastActivity: string; // ISO date string
	clientInfo?: {
		name: string;
		version: string;
	};
	isConnected: boolean;
	connectionStatus?: 'Connected' | 'Distressed' | 'Disconnected';
	pingFailures?: number;
	lastPingAttempt?: string; // ISO date string
}

export interface TransportMetricsResponse {
	transport: TransportType;
	isStateless: boolean;
	startupTime: string; // ISO date string
	currentTime: string; // ISO date string
	uptimeSeconds: number;

	// Configuration settings (only for stateful transports)
	configuration?: {
		heartbeatInterval: number; // milliseconds
		staleCheckInterval: number; // milliseconds
		staleTimeout: number; // milliseconds
		pingEnabled?: boolean;
		pingInterval?: number; // milliseconds
		pingFailureThreshold?: number; // number of failed pings before distressed
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

	// Static page hits (stateless transport only)
	staticPageHits200?: number;
	staticPageHits405?: number;

	pings?: {
		sent: number;
		successful: number;
		failed: number;
		lastPingTime?: string; // ISO date string
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

	sessions: SessionData[];

	methods: Array<{
		method: string;
		count: number;
		firstCalled: string; // ISO date string
		lastCalled: string; // ISO date string
		averageResponseTime?: number; // milliseconds
		errors: number;
		errorRate: number; // percentage
	}>;

	// API call metrics (only shown in external API mode)
	apiMetrics?: ApiCallMetrics;
}

/**
 * Convert internal metrics to API response format
 */
export function formatMetricsForAPI(
	metrics: TransportMetrics,
	transport: TransportType,
	isStateless: boolean,
	sessions: SessionData[] = []
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
		pings: metrics.pings ? {
			...metrics.pings,
			lastPingTime: metrics.pings.lastPingTime?.toISOString()
		} : undefined,
		errors: {
			...metrics.errors,
			lastError: metrics.errors.lastError
				? {
						...metrics.errors.lastError,
						timestamp: metrics.errors.lastError.timestamp.toISOString(),
					}
				: undefined,
		},
		clients: Array.from(metrics.clients.values()).map((client) => ({
			...client,
			firstSeen: client.firstSeen.toISOString(),
			lastSeen: client.lastSeen.toISOString(),
		})),
		sessions,
		staticPageHits200: metrics.staticPageHits200,
		staticPageHits405: metrics.staticPageHits405,
		methods: Array.from(metrics.methods.values()).map((method) => ({
			...method,
			firstCalled: method.firstCalled.toISOString(),
			lastCalled: method.lastCalled.toISOString(),
			errorRate: method.count > 0 ? (method.errors / method.count) * 100 : 0,
		})),
	};
}

/**
 * Check if a method name is an initialization request
 */
export function isInitializeRequest(method: string): boolean {
	return method === 'initialize';
}

/**
 * Create a new empty metrics object
 */
export function createEmptyMetrics(): TransportMetrics {
	return {
		startupTime: new Date(),
		connections: {
			active: 0,
			total: 0,
			authenticated: 0,
			denied: 0,
			anonymous: 0,
		},
		requests: {
			total: 0,
			averagePerMinute: 0,
		},
		errors: {
			expected: 0,
			unexpected: 0,
		},
		clients: new Map(),
		methods: new Map(),
		staticPageHits200: 0,
		staticPageHits405: 0,
	};
}

/**
 * Get client identity key from name and version
 */
export function getClientKey(name: string, version: string): string {
	return `${name} ${version}`;
}

/**
 * Centralized metrics counter for transport operations
 */
export class MetricsCounter {
	private metrics: TransportMetrics;

	constructor() {
		this.metrics = createEmptyMetrics();
	}

	/**
	 * Get the underlying metrics data
	 */
	getMetrics(): TransportMetrics {
		return this.metrics;
	}

	/**
	 * Track a new request received by the transport
	 */
	trackRequest(): void {
		this.metrics.requests.total++;
		this.updateRequestsPerMinute();
	}

	/**
	 * Track an error in the transport
	 */
	trackError(statusCode?: number, error?: Error): void {
		if (statusCode && statusCode >= 400 && statusCode < 500) {
			this.metrics.errors.expected++;
		} else {
			this.metrics.errors.unexpected++;
		}

		if (error) {
			this.metrics.errors.lastError = {
				type: error.constructor.name,
				message: error.message,
				timestamp: new Date(),
			};
		}
	}

	/**
	 * Track a new connection established (global counter)
	 */
	trackNewConnection(): void {
		this.metrics.connections.total++;
	}

	/**
	 * Update active connection count
	 */
	updateActiveConnections(count: number): void {
		this.metrics.connections.active = count;
	}

	/**
	 * Track a session that was cleaned up/removed
	 */
	trackSessionCleaned(): void {
		if (!this.metrics.connections.cleaned) {
			this.metrics.connections.cleaned = 0;
		}
		this.metrics.connections.cleaned++;
	}

	/**
	 * Associate a session with a client identity when client info becomes available
	 */
	associateSessionWithClient(clientInfo: { name: string; version: string }): void {
		const clientKey = getClientKey(clientInfo.name, clientInfo.version);
		let clientMetrics = this.metrics.clients.get(clientKey);

		if (!clientMetrics) {
			clientMetrics = {
				name: clientInfo.name,
				version: clientInfo.version,
				requestCount: 0,
				firstSeen: new Date(),
				lastSeen: new Date(),
				isConnected: true,
				activeConnections: 1,
				totalConnections: 1,
			};
			this.metrics.clients.set(clientKey, clientMetrics);
		} else {
			clientMetrics.lastSeen = new Date();
			clientMetrics.isConnected = true;
			clientMetrics.activeConnections++;
			clientMetrics.totalConnections++;
		}
	}

	/**
	 * Update client activity when a request is made
	 */
	updateClientActivity(clientInfo?: { name: string; version: string }): void {
		if (!clientInfo) return;

		const clientKey = getClientKey(clientInfo.name, clientInfo.version);
		const clientMetrics = this.metrics.clients.get(clientKey);

		if (clientMetrics) {
			clientMetrics.requestCount++;
			clientMetrics.lastSeen = new Date();
		}
	}

	/**
	 * Mark a client connection as disconnected
	 */
	disconnectClient(clientInfo?: { name: string; version: string }): void {
		if (!clientInfo) return;

		const clientKey = getClientKey(clientInfo.name, clientInfo.version);
		const clientMetrics = this.metrics.clients.get(clientKey);

		if (clientMetrics && clientMetrics.activeConnections > 0) {
			clientMetrics.activeConnections--;
			if (clientMetrics.activeConnections === 0) {
				clientMetrics.isConnected = false;
			}
		}
	}

	/**
	 * Track a method call
	 */
	trackMethod(method: string | null, responseTime?: number, isError: boolean = false): void {
		if (!method) return;
		let methodMetrics = this.metrics.methods.get(method);

		if (!methodMetrics) {
			methodMetrics = {
				method,
				count: 0,
				firstCalled: new Date(),
				lastCalled: new Date(),
				errors: 0,
			};
			this.metrics.methods.set(method, methodMetrics);
		}

		methodMetrics.count++;
		methodMetrics.lastCalled = new Date();

		if (isError) {
			methodMetrics.errors++;
		}

		// Update average response time if provided
		if (responseTime !== undefined && !isError) {
			const successfulCalls = methodMetrics.count - methodMetrics.errors;
			if (successfulCalls === 1) {
				methodMetrics.averageResponseTime = responseTime;
			} else {
				const currentAvg = methodMetrics.averageResponseTime || 0;
				const totalTime = currentAvg * (successfulCalls - 1) + responseTime;
				methodMetrics.averageResponseTime = totalTime / successfulCalls;
			}
		}
	}

	/**
	 * Track a ping being sent
	 */
	trackPingSent(): void {
		if (!this.metrics.pings) {
			this.metrics.pings = {
				sent: 0,
				successful: 0,
				failed: 0,
			};
		}
		this.metrics.pings.sent++;
	}

	/**
	 * Track a successful ping response
	 */
	trackPingSuccess(): void {
		if (!this.metrics.pings) {
			this.metrics.pings = {
				sent: 0,
				successful: 0,
				failed: 0,
			};
		}
		this.metrics.pings.successful++;
		this.metrics.pings.lastPingTime = new Date();
	}

	/**
	 * Track a failed ping
	 */
	trackPingFailed(): void {
		if (!this.metrics.pings) {
			this.metrics.pings = {
				sent: 0,
				successful: 0,
				failed: 0,
			};
		}
		this.metrics.pings.failed++;
	}

	/**
	 * Track a static page hit with status code
	 */
	trackStaticPageHit(statusCode: number): void {
		if (statusCode === 200) {
			this.metrics.staticPageHits200!++;
		} else if (statusCode === 405) {
			this.metrics.staticPageHits405!++;
		}
	}

	/**
	 * Update requests per minute calculation
	 */
	private updateRequestsPerMinute(): void {
		const now = Date.now();
		const startupTime = this.metrics.startupTime.getTime();
		const uptimeMinutes = (now - startupTime) / (1000 * 60);

		this.metrics.requests.averagePerMinute =
			uptimeMinutes > 0 ? Math.round((this.metrics.requests.total / uptimeMinutes) * 100) / 100 : 0;
	}
}
