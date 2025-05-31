import { logger } from './logger.js';
import type { AppSettings } from '../../shared/settings.js';

export interface ToolStateChangeCallback {
    (toolId: string, enabled: boolean): void;
}

export class McpApiClient {
    private baseUrl: string;
    private pollInterval: number;
    private pollTimer: NodeJS.Timeout | null = null;
    private cache: Map<string, boolean> = new Map();
    private isPolling = false;

    constructor(baseUrl: string, pollInterval: number = 5000) {
        this.baseUrl = baseUrl;
        this.pollInterval = pollInterval;
    }

    async getSettings(): Promise<AppSettings | null> {
        try {
            const response = await fetch(`${this.baseUrl}/api/settings`);
            if (!response.ok) {
                logger.error(`Failed to fetch settings: ${response.status.toString()} ${response.statusText}`);
                return null;
            }
            return await response.json() as AppSettings;
        } catch (error) {
            logger.error({ error }, 'Error fetching settings from API');
            return null;
        }
    }

    async getToolStates(): Promise<Record<string, boolean> | null> {
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

    async startPolling(onUpdate: ToolStateChangeCallback): Promise<void> {
        if (this.isPolling) {
            logger.warn('Polling already started');
            return;
        }

        this.isPolling = true;
        logger.info(`Starting API polling with interval ${this.pollInterval.toString()}ms`);

        // Initial fetch to populate cache
        const initialStates = await this.getToolStates();
        if (initialStates) {
            for (const [toolId, enabled] of Object.entries(initialStates)) {
                this.cache.set(toolId, enabled);
                // Call the callback for initial state
                onUpdate(toolId, enabled);
            }
        }

        // Start polling
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
        }, this.pollInterval);
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
        try {
            const response = await fetch(`${this.baseUrl}/api/settings/tools/${toolId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
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

    destroy(): void {
        this.stopPolling();
        this.cache.clear();
    }
}