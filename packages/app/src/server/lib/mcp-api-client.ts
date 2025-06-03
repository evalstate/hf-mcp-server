import { EventEmitter } from 'events';
import { logger } from './logger.js';
import type { AppSettings } from '../../shared/settings.js';
import type { TransportInfo } from '../../shared/transport-info.js';

export interface ToolStateChangeCallback {
	(toolId: string, enabled: boolean): void;
}

export interface GradioEndpoint {
	url: string;
	enabled?: boolean;
}

export interface ApiClientConfig {
	type: 'static' | 'polling' | 'external';
	staticSettings?: Record<string, boolean>;
	staticGradioEndpoints?: GradioEndpoint[];
	baseUrl?: string;
	pollInterval?: number;
	externalUrl?: string;
	hfToken?: string;
}

export class McpApiClient extends EventEmitter {
	private config: ApiClientConfig;
	private pollTimer: NodeJS.Timeout | null = null;
	private cache: Map<string, boolean> = new Map();
	private gradioEndpoints: GradioEndpoint[] = [];
	private gradioEndpointStates: Map<number, boolean> = new Map();
	private isPolling = false;
	private transportInfo: TransportInfo | null = null;

	constructor(config: ApiClientConfig, transportInfo?: TransportInfo) {
		super();
		this.config = config;
		this.transportInfo = transportInfo || null;

		// Initialize static data if provided
		if (config.type === 'static') {
			if (config.staticSettings) {
				for (const [toolId, enabled] of Object.entries(config.staticSettings)) {
					this.cache.set(toolId, enabled);
				}
			}
			if (config.staticGradioEndpoints) {
				this.gradioEndpoints = [...config.staticGradioEndpoints];
				// Ensure we always have 3 endpoints
				while (this.gradioEndpoints.length < 3) {
					this.gradioEndpoints.push({ url: '', enabled: true });
				}
				// Initialize all endpoints as enabled by default
				this.gradioEndpoints.forEach((endpoint, index) => {
					this.gradioEndpointStates.set(index, endpoint.enabled !== false);
				});
			}
		} else if (config.type === 'polling' && config.staticGradioEndpoints) {
			// Also support default Gradio endpoints in polling mode
			this.gradioEndpoints = [...config.staticGradioEndpoints];
			// Ensure we always have 3 endpoints
			while (this.gradioEndpoints.length < 3) {
				this.gradioEndpoints.push({ url: '', enabled: true });
			}
			// Initialize all endpoints as enabled by default
			this.gradioEndpoints.forEach((endpoint, index) => {
				this.gradioEndpointStates.set(index, endpoint.enabled !== false);
			});
		}
	}

	getTransportInfo(): TransportInfo | null {
		return this.transportInfo;
	}

	async getSettings(): Promise<AppSettings | null> {
		switch (this.config.type) {
			case 'static':
				// Return static settings - no network call needed
				return null; // Static mode doesn't use AppSettings format

			case 'polling':
				if (!this.config.baseUrl) {
					logger.error('baseUrl required for polling mode');
					return null;
				}
				try {
					const response = await fetch(`${this.config.baseUrl}/api/settings`);
					if (!response.ok) {
						logger.error(`Failed to fetch settings: ${response.status.toString()} ${response.statusText}`);
						return null;
					}
					return (await response.json()) as AppSettings;
				} catch (error) {
					logger.error({ error }, 'Error fetching settings from local API');
					return null;
				}

			case 'external':
				if (!this.config.externalUrl) {
					logger.error('externalUrl required for external mode');
					return null;
				}
				try {
					const headers: Record<string, string> = {};
					if (this.config.hfToken) {
						headers['Authorization'] = `Bearer ${this.config.hfToken}`;
					}

					const response = await fetch(this.config.externalUrl, { headers });
					if (!response.ok) {
						logger.error(`Failed to fetch external settings: ${response.status.toString()} ${response.statusText}`);
						return null;
					}
					return (await response.json()) as AppSettings;
				} catch (error) {
					logger.error({ error }, 'Error fetching settings from external API');
					return null;
				}

			default:
				logger.error(`Unknown API client type: ${String(this.config.type)}`);
				return null;
		}
	}

	async getToolStates(): Promise<Record<string, boolean> | null> {
		if (this.config.type === 'static') {
			// Return cached static settings
			const toolStates: Record<string, boolean> = {};
			for (const [toolId, enabled] of this.cache.entries()) {
				toolStates[toolId] = enabled;
			}
			return toolStates;
		}

		const settings = await this.getSettings();
		if (!settings) {
			return null;
		}

		const toolStates: Record<string, boolean> = {};
		for (const [toolId, toolSettings] of Object.entries(settings.tools)) {
			toolStates[toolId] = toolSettings.enabled;
		}
		return toolStates;
	}

	getGradioEndpoints(): GradioEndpoint[] {
		// Return endpoints with their enabled state
		return this.gradioEndpoints.map((endpoint, index) => ({
			...endpoint,
			enabled: this.gradioEndpointStates.get(index) ?? true,
		}));
	}

	updateGradioEndpointState(index: number, enabled: boolean): void {
		if (index >= 0 && index < this.gradioEndpoints.length) {
			this.gradioEndpointStates.set(index, enabled);
			const endpoint = this.gradioEndpoints[index];
			if (endpoint) {
				logger.info(`Gradio endpoint ${(index + 1).toString()} set to ${enabled ? 'enabled' : 'disabled'}`);
			}
		}
	}

	updateGradioEndpointUrl(index: number, url: string): void {
		// Ensure we have at least index + 1 endpoints
		while (this.gradioEndpoints.length <= index) {
			this.gradioEndpoints.push({ url: '', enabled: true });
			this.gradioEndpointStates.set(this.gradioEndpoints.length - 1, true);
		}
		
		if (index >= 0 && index < 3) { // Limit to 3 endpoints
			const endpoint = this.gradioEndpoints[index];
			if (endpoint) {
				endpoint.url = url;
				logger.info(`Gradio endpoint ${(index + 1).toString()} URL updated to ${url}`);
			}
		}
	}

	async startPolling(onUpdate: ToolStateChangeCallback): Promise<void> {
		if (this.isPolling) {
			logger.warn('Polling already started');
			return;
		}

		this.isPolling = true;

		// Handle different modes
		if (this.config.type === 'static') {
			logger.info('Using static tool settings - no polling needed');
			// Send initial static states
			for (const [toolId, enabled] of this.cache.entries()) {
				onUpdate(toolId, enabled);
			}
			return;
		}

		const pollInterval = this.config.pollInterval || 5000;
		logger.info(`Starting API polling with interval ${pollInterval.toString()}ms`);

		// Initial fetch to populate cache
		const initialStates = await this.getToolStates();
		if (initialStates) {
			for (const [toolId, enabled] of Object.entries(initialStates)) {
				this.cache.set(toolId, enabled);
				// Call the callback for initial state
				onUpdate(toolId, enabled);
			}
		}

		// Start polling (we've already handled static mode above)
		this.pollTimer = setInterval(() => {
			void (async () => {
				const states = await this.getToolStates();
				if (!states) {
					logger.warn('Failed to fetch tool states during polling');
					return;
				}

				// Check for changes
				for (const [toolId, enabled] of Object.entries(states)) {
					const cachedState = this.cache.get(toolId);
					if (cachedState !== enabled) {
						logger.info(`Tool ${toolId} state changed: ${String(cachedState)} -> ${String(enabled)}`);
						this.cache.set(toolId, enabled);
						onUpdate(toolId, enabled);
						// Emit event for any listening servers
						this.emit('toolStateChange', toolId, enabled);
					}
				}

				// Check for removed tools
				for (const [toolId, _] of this.cache) {
					if (!(toolId in states)) {
						logger.info(`Tool ${toolId} removed from settings`);
						this.cache.delete(toolId);
					}
				}
			})();
		}, pollInterval);
	}

	stopPolling(): void {
		if (this.pollTimer) {
			clearInterval(this.pollTimer);
			this.pollTimer = null;
			this.isPolling = false;
			logger.info('Stopped API polling');
		}
	}

	async updateToolState(toolId: string, enabled: boolean): Promise<boolean> {
		if (this.config.type === 'static') {
			logger.warn('Cannot update tool state in static mode');
			return false;
		}

		const baseUrl = this.config.type === 'polling' ? this.config.baseUrl : this.config.externalUrl;
		if (!baseUrl) {
			logger.error('No base URL configured for tool state updates');
			return false;
		}

		try {
			const headers: Record<string, string> = {
				'Content-Type': 'application/json',
			};

			if (this.config.type === 'external' && this.config.hfToken) {
				headers['Authorization'] = `Bearer ${this.config.hfToken}`;
			}

			const response = await fetch(`${baseUrl}/api/settings/tools/${toolId}`, {
				method: 'POST',
				headers,
				body: JSON.stringify({ enabled }),
			});

			if (!response.ok) {
				logger.error(`Failed to update tool state: ${response.status.toString()} ${response.statusText}`);
				return false;
			}

			// Update local cache immediately
			this.cache.set(toolId, enabled);
			return true;
		} catch (error) {
			logger.error({ error }, `Error updating tool ${toolId} state`);
			return false;
		}
	}

	/**
	 * Get cached tool state synchronously (for use during server creation)
	 */
	getCachedToolState(toolId: string): boolean {
		return this.cache.get(toolId) ?? true; // Default to enabled if not in cache
	}

	/**
	 * Get all cached tool states synchronously
	 */
	getCachedToolStates(): Record<string, boolean> {
		const states: Record<string, boolean> = {};
		for (const [toolId, enabled] of this.cache.entries()) {
			states[toolId] = enabled;
		}
		return states;
	}

	destroy(): void {
		this.stopPolling();
		this.cache.clear();
	}
}
