/**
 * Test implementation of ApiClient that uses the local settings service
 * Provides live updates for testing the dynamic tool enable/disable behavior
 */

import type { ApiClient, McpServerSettings, SettingsUpdateCallback } from '../shared/api-client.js';
import { appSettingsToMcpSettings } from '../shared/api-client.js';
import { settingsService } from '../shared/settings.js';

/**
 * Test API client that uses local settings service and supports live updates
 */
export class TestApiClient implements ApiClient {
  private updateCallbacks: Set<SettingsUpdateCallback> = new Set();
  private isSetup = false;

  getSettings(): Promise<McpServerSettings> {
    const appSettings = settingsService.getSettings();
    return Promise.resolve(appSettingsToMcpSettings(appSettings));
  }

  onSettingsUpdate(callback: SettingsUpdateCallback): () => void {
    this.updateCallbacks.add(callback);
    this.ensureGlobalListenerSetup();

    // Return cleanup function
    return () => {
      this.updateCallbacks.delete(callback);
    };
  }

  cleanup(): Promise<void> {
    this.updateCallbacks.clear();
    // Note: We don't remove the global listener since other instances might be using it
    return Promise.resolve();
  }

  /**
   * Trigger settings update for all registered callbacks
   * Called by the global settings change listener
   */
  triggerUpdate(): void {
    const appSettings = settingsService.getSettings();
    const mcpSettings = appSettingsToMcpSettings(appSettings);
    
    for (const callback of this.updateCallbacks) {
      try {
        callback(mcpSettings);
      } catch {
        // Silently ignore callback errors to prevent logging interference
      }
    }
  }

  private ensureGlobalListenerSetup(): void {
    if (this.isSetup) return;
    this.isSetup = true;

    // Set up global listener for settings changes
    // Note: This is a simple approach - in production we'd have a more sophisticated pub/sub system
    if (!globalSettingsManager.isSetup) {
      globalSettingsManager.setup();
    }
    globalSettingsManager.addClient(this);
  }
}

/**
 * Global manager to coordinate settings updates across all ApiClient instances
 * This simulates what would happen with a real pub/sub system
 */
class GlobalSettingsManager {
  private clients: Set<TestApiClient> = new Set();
  public isSetup = false;

  setup(): void {
    if (this.isSetup) return;
    this.isSetup = true;

    // Monkey patch the settings service to notify us of changes
    const originalUpdateBuiltInTools = settingsService.updateBuiltInTools.bind(settingsService);
    settingsService.updateBuiltInTools = (builtInTools: string[]) => {
      const result = originalUpdateBuiltInTools(builtInTools);
      
      // Notify all clients of the update
      this.notifyClients();
      
      return result;
    };
  }

  addClient(client: TestApiClient): void {
    this.clients.add(client);
  }

  removeClient(client: TestApiClient): void {
    this.clients.delete(client);
  }

  private notifyClients(): void {
    for (const client of this.clients) {
      client.triggerUpdate();
    }
  }
}

const globalSettingsManager = new GlobalSettingsManager();