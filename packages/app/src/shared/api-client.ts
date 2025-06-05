/**
 * API Client interface for providing settings to McpServer
 * Abstracts the source of configuration settings - whether from external API or local settings
 */

import type { AppSettings } from './settings.js';

export interface McpServerSettings {
  /** Which tools should be enabled */
  enabledTools: Set<string>;
  /** Additional server configuration can be added here */
}

/**
 * Callback type for when settings change
 */
export type SettingsUpdateCallback = (settings: McpServerSettings) => void;

/**
 * API Client interface that provides settings to McpServer
 * Different implementations can provide settings from different sources
 */
export interface ApiClient {
  /**
   * Get initial settings for McpServer configuration
   */
  getSettings(): Promise<McpServerSettings>;

  /**
   * Subscribe to settings updates (optional - only if backend supports live updates)
   * @param callback Function to call when settings change
   * @returns Cleanup function to unsubscribe
   */
  onSettingsUpdate?(callback: SettingsUpdateCallback): () => void;

  /**
   * Clean up any resources (connections, listeners, etc.)
   */
  cleanup(): Promise<void>;
}

/**
 * Convert AppSettings to McpServerSettings format
 */
export function appSettingsToMcpSettings(appSettings: AppSettings): McpServerSettings {
  const enabledTools = new Set<string>(appSettings.builtInTools);

  return {
    enabledTools,
  };
}