import { EventEmitter } from 'events';
import { logger } from './logger.js';
import type { AppSettings } from '../../shared/settings.js';
import type { TransportInfo } from '../../shared/transport-info.js';

export interface ToolStateChangeCallback {
	(toolId: string, enabled: boolean): void;
}

export interface GradioEndpoint {
	name: string;
	subdomain: string;
	id?: string;
	emoji?: string;
}

export interface ApiClientConfig {
	type: 'static' | 'polling' | 'external';
	staticSettings?: Record<string, boolean>;
	staticGradioEndpoints?: GradioEndpoint[];
	baseUrl?: string;
	pollInterval?: number;
	externalUrl?: string;
	userConfigUrl?: string;
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
			}
		} else if (config.type === 'polling' && config.staticGradioEndpoints) {
			// Also support default Gradio endpoints in polling mode
			this.gradioEndpoints = [...config.staticGradioEndpoints];
		}
	}

	getTransportInfo(): TransportInfo | null {
		return this.transportInfo;
	}

	async getSettings(overrideToken?: string): Promise<AppSettings | null> {
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
					const token = overrideToken || this.config.hfToken;

					if (token) {
						headers['Authorization'] = `Bearer ${token}`;
					}

					// Add 10 second timeout
					headers['Accept'] = 'application/json';
					const controller = new AbortController();
					const timeoutId = setTimeout(() => controller.abort(), 10000);

					const response = await fetch(this.config.externalUrl, {
						headers,
						signal: controller.signal,
					});

					clearTimeout(timeoutId);
					if (!response.ok) {
						logger.warn(
							`Failed to fetch external settings: ${response.status.toString()} ${response.statusText} - defaulting to all tools enabled`
						);
						// Return empty array to enable all tools
						return { builtInTools: [], spaceTools: [] };
					}
					return (await response.json()) as AppSettings;
				} catch (error) {
					logger.warn({ error }, 'Error fetching settings from external API - defaulting to all tools enabled');
					// Return empty array to enable all tools
					return { builtInTools: [], spaceTools: [] };
				}

			default:
				logger.error(`Unknown API client type: ${String(this.config.type)}`);
				return null;
		}
	}

	async getToolStates(overrideToken?: string): Promise<Record<string, boolean> | null> {
		if (this.config.type === 'static') {
			// Return cached static settings
			const toolStates: Record<string, boolean> = {};
			for (const [toolId, enabled] of this.cache.entries()) {
				toolStates[toolId] = enabled;
			}
			return toolStates;
		}

		const settings = await this.getSettings(overrideToken);
		if (!settings) {
			return null;
		}

		const toolStates: Record<string, boolean> = {};

		// Empty array means all enabled
		if (settings.builtInTools.length === 0) {
			// Default all known tools to enabled
			const allTools = [
				'space_search',
				'model_search',
				'model_detail',
				'paper_search',
				'dataset_search',
				'dataset_detail',
				'duplicate_space',
				'space_info',
				'space_files',
			];
			for (const toolId of allTools) {
				toolStates[toolId] = true;
			}
		} else {
			// Only enable specified tools
			for (const toolId of settings.builtInTools) {
				toolStates[toolId] = true;
			}
		}

		return toolStates;
	}

	getGradioEndpoints(): GradioEndpoint[] {
		return this.gradioEndpoints;
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

	updateGradioEndpoint(index: number, endpoint: GradioEndpoint): void {
		if (index >= 0 && index < this.gradioEndpoints.length) {
			this.gradioEndpoints[index] = endpoint;
			logger.info(`Gradio endpoint ${(index + 1).toString()} updated to ${endpoint.name}`);
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

		// For external mode, fetch once but don't poll
		if (this.config.type === 'external') {
			logger.info('Using external user config API - fetching once, no polling');
			const initialStates = await this.getToolStates();
			if (initialStates) {
				for (const [toolId, enabled] of Object.entries(initialStates)) {
					this.cache.set(toolId, enabled);
					onUpdate(toolId, enabled);
				}
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

	/**
	 * Get cached tool state synchronously (for use during server creation)
	 */
	getCachedToolState(toolId: string): boolean {
		return this.cache.get(toolId) ?? false; // Default to disabled if not in cache
	}

	/**
	 * Set cached tool state (for initialization before polling starts)
	 */
	setCachedToolState(toolId: string, enabled: boolean): void {
		this.cache.set(toolId, enabled);
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
