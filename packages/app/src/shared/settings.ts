/**
 * Settings service for the MCP server
 * Manages application settings like enabled search tools
 */

// Define the settings types
export interface AppSettings {
  builtInTools: string[];
  // Future setting categories can be added here
}

// Default settings
const defaultSettings: AppSettings = {
  builtInTools: [
    'space_search',
    'model_search', 
    'model_detail',
    'paper_search',
    'dataset_search',
    'dataset_detail',
    'duplicate_space',
    'space_info',
    'space_files',
  ],
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
   * Update built-in tools array
   */
  updateBuiltInTools(builtInTools: string[]): AppSettings {
    settings = {
      ...settings,
      builtInTools: [...builtInTools],
    };
    return { ...settings };
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
    return settings.builtInTools.includes(toolId);
  },
};
