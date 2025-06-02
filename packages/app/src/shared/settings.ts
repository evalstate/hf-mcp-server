/**
 * Settings service for the MCP server
 * Manages application settings like enabled search tools
 */

// Define the settings types
export interface ToolSettings {
  enabled: boolean;
  // Additional properties can be added for each tool as needed
}

export interface AppSettings {
  tools: {
    [toolId: string]: ToolSettings;
  };
  // Future setting categories can be added here
}

// Default settings
const defaultSettings: AppSettings = {
  tools: {
    space_search: { // Changed from space_semantic_search to match SEMANTIC_SEARCH_TOOL_CONFIG.name
      enabled: true,
    },
    model_search: {
      enabled: true,
    },
    model_detail: {
      enabled: true,
    },
    paper_search: { // Changed from paper_semantic_search to match PAPER_SEARCH_TOOL_CONFIG.name
      enabled: true,
    },
    dataset_search: {
      enabled: true,
    },
    dataset_detail: {
      enabled: true,
    },
    duplicate_space: {
      enabled: true,
    },
  },
};

// In-memory settings store (could be replaced with persistence later)
let settings: AppSettings = { ...defaultSettings };

export const settingsService = {
  /**
   * Get all application settings
   */
  getSettings(): AppSettings {
    return { ...settings };
  },

  /**
   * Get settings for a specific tool
   */
  getToolSettings(toolId: string): ToolSettings | undefined {
    return settings.tools[toolId] ? { ...settings.tools[toolId] } : undefined;
  },

  /**
   * Update settings for a specific tool
   */
  updateToolSettings(
    toolId: string,
    newSettings: Partial<ToolSettings>
  ): ToolSettings {
    // Create tool settings if they don't exist
    if (!settings.tools[toolId]) {
      settings.tools[toolId] = { enabled: false };
    }

    // Update settings
    settings.tools[toolId] = {
      ...settings.tools[toolId],
      ...newSettings,
    };

    return { ...settings.tools[toolId] };
  },

  /**
   * Reset all settings to default values
   */
  resetSettings(): AppSettings {
    settings = { ...defaultSettings };
    return { ...settings };
  },

  /**
   * Check if a tool is enabled
   */
  isToolEnabled(toolId: string): boolean {
    return !!settings.tools[toolId]?.enabled;
  },
};
