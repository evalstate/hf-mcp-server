#!/usr/bin/env node

import express from "express";
import path, { format } from "path";
import { fileURLToPath } from "url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  ToolSchema,
  SamplingMessageSchema,
  ToolAnnotationsSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

// Import the semantic search service
import {
  semanticSearch,
  SearchParamsSchema,
  formatSearchResults,
} from "./src/services/semantic-search.js";

// Import the settings service
import { settingsService, AppSettings, ToolSettings } from "./src/services/settings.js";

// Import shared constants
import { TransportType, DEFAULT_WEB_APP_PORT, DEFAULT_MCP_PORT } from "./constants.js";

// Define type for registered tools
interface RegisteredTool {
  enable: () => void;
  disable: () => void;
  remove: () => void;
}

// Track the active transport type and port
let activeTransport: TransportType = 'unknown';
let activePort: number | undefined = undefined;

// Function to mask token (show first 4 and last 5 chars)
const maskToken = (token: string): string => {
  if (!token || token.length <= 9) return token;
  return `${token.substring(0, 4)}...${token.substring(token.length - 5)}`;
};

// Get HF token from environment
const getHfToken = (): string | undefined => {
  return process.env.HF_TOKEN || process.env.HUGGING_FACE_TOKEN;
};

// Create an Express app to serve the React frontend and provide transport info
const app = express();
let webServer: any = null;

export const createServer = (transportType: TransportType = 'unknown', webAppPort: number = DEFAULT_WEB_APP_PORT, mcpPort: number = DEFAULT_MCP_PORT) => {
  const server = new McpServer(
  {
    name: "hf-mcp-server",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: { listChanged: true },
    },
  }
  );
  
  // Set active transport and port
  activeTransport = transportType;
  
  // Set the port for transports that use a port
  if (transportType === 'sse' || transportType === 'streamableHttp') {
    activePort = mcpPort;
  }
  // Define the semantic search tool using our service
  // Define the semantic search tool
  const spaceSearchTool = server.tool(
    "space_semantic_search",
    {
      query: z.string().min(1, "Search query is required"),
      limit: z.number().optional(),
    },
    async ({ query, limit }) => {
      const results = await semanticSearch.search(query, limit);
      return {
        content: [{ type: "text", text: formatSearchResults(query, results) }],
      };
    }
  );
  
  // Store the tool reference for later enable/disable
  const registeredTools: { [toolId: string]: RegisteredTool } = {
    space_semantic_search: spaceSearchTool
  };
  
  // Initialize tool state based on settings
  const initialSettings = settingsService.getSettings();
  for (const [toolId, toolSettings] of Object.entries(initialSettings.tools)) {
    if (registeredTools[toolId]) {
      if (toolSettings.enabled) {
        registeredTools[toolId].enable();
        console.log(`Tool ${toolId} initialized as enabled`);
      } else {
        registeredTools[toolId].disable();
        console.log(`Tool ${toolId} initialized as disabled`);
      }
    }
  }
  
  // Define a text-based resource with the settings
  server.resource(
    "settings",
    "/settings", 
    async () => {
      // Format settings as a resource with contents array containing a text item
      const settings = settingsService.getSettings();
      return {
        contents: [
          {
            text: JSON.stringify(settings, null, 2),
            uri: "/settings",
            mimeType: "application/json"
          }
        ]
      };
    }
  );
  
  // Create a standard API endpoint for settings update instead of MCP resource update
  // since we're already using a REST API for the frontend
  
  // Tools settings management tool
  server.tool(
    "manage_tool_settings",
    {
      toolId: z.string().min(1, "Tool ID is required"),
      enabled: z.boolean(),
    },
    async ({ toolId, enabled }: { toolId: string; enabled: boolean }) => {
      // Update the settings in our service
      const updatedSettings = settingsService.updateToolSettings(toolId, { enabled });
      
      // Enable or disable the MCP tool if it exists in our registry
      if (registeredTools[toolId]) {
        if (enabled) {
          registeredTools[toolId].enable();
          console.log(`Tool ${toolId} has been enabled`);
        } else {
          registeredTools[toolId].disable();
          console.log(`Tool ${toolId} has been disabled`);
        }
      } else {
        console.log(`Tool ${toolId} not found in registered tools`);
      }
      
      return {
        content: [{ 
          type: "text", 
          text: `The ${toolId} tool has been ${enabled ? "enabled" : "disabled"}.` 
        }],
      };
    }
  );

  // Serve the React app from the dist directory
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const distPath = path.join(__dirname);
  
  app.use(express.static(distPath));
  
  // API endpoint to get the active transport, port, and masked token
  app.get('/api/transport', (req, res) => {
    const hfToken = getHfToken();
    
    // Define the type for transport info with all possible properties
    type TransportInfoResponse = {
      transport: TransportType;
      hfTokenSet: boolean;
      hfTokenMasked?: string;
      port?: number;
    };
    
    const transportInfo: TransportInfoResponse = { 
      transport: activeTransport,
      hfTokenSet: !!hfToken
    };
    
    // Add masked token if it exists
    if (hfToken) {
      transportInfo.hfTokenMasked = maskToken(hfToken);
    }
    
    // Add port if available for relevant transports
    if (activePort && (activeTransport === 'sse' || activeTransport === 'streamableHttp')) {
      transportInfo.port = activePort;
    }
    
    res.json(transportInfo);
  });
  
  // API endpoint to get settings
  app.get('/api/settings', (req, res) => {
    res.json(settingsService.getSettings());
  });
  
  // API endpoint to update tool settings
  app.post('/api/settings/tools/:toolId', express.json(), (req, res) => {
    const { toolId } = req.params;
    const updatedSettings = settingsService.updateToolSettings(toolId, req.body as Partial<ToolSettings>);
    
    // Enable or disable the actual MCP tool if it exists
    if (registeredTools[toolId]) {
      if (req.body.enabled) {
        registeredTools[toolId].enable();
        console.log(`Tool ${toolId} has been enabled via API`);
      } else {
        registeredTools[toolId].disable();
        console.log(`Tool ${toolId} has been disabled via API`);
      }
    }
    
    res.json(updatedSettings);
  });
  
  // For any other route, serve the index.html file (for SPA navigation)
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });

  // Start the web server if it's not already running
  const startWebServer = () => {
    if (!webServer) {
      webServer = app.listen(webAppPort, () => {
        console.log(`React app serving at http://localhost:${webAppPort}`);
      });
    }
  };

  const cleanup = async () => {
    if (webServer) 
      console.log('Shutting down web server...');
      // improve mcp server & express shutdown handling
  };
  startWebServer();
  return { server, cleanup };  
}
