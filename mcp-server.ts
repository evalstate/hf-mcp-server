#!/usr/bin/env node

import express from "express";
import path, { format } from "path";
import { fileURLToPath } from "url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { InMemoryEventStore } from '@modelcontextprotocol/sdk/examples/shared/inMemoryEventStore.js';
import { randomUUID } from 'node:crypto';
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
import { TransportType, DEFAULT_WEB_APP_PORT } from "./constants.js";

// Define type for registered tools
interface RegisteredTool {
  enable: () => void;
  disable: () => void;
  remove: () => void;
}

// Import minimist for parsing command line arguments
import minimist from 'minimist';

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
// Determine if we're in development mode
const isDev = process.env.NODE_ENV === 'development';

export const createServer = async (transportType: TransportType = 'unknown', webAppPort: number = DEFAULT_WEB_APP_PORT) => {
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
  
  // Since we're consolidating servers, we'll use the web app port for all transports
  if (transportType === 'sse' || transportType === 'streamableHttp') {
    activePort = webAppPort;
  }
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
  
  

  // Get the file paths
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  
  // Configure API endpoints first (these need to be available in both dev and prod)
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
    
    if (hfToken) {
      transportInfo.hfTokenMasked = maskToken(hfToken);
    }
    
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
  
  if (transportType === 'sse') {
    // Add SSE endpoints to the main Express app
    let sseTransport: SSEServerTransport;
    
    app.get("/sse", async (req, res) => {
      console.log("Received SSE connection");
      // Set the correct content type for SSE
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      
      sseTransport = new SSEServerTransport("/message", res);
      await server.connect(sseTransport);
      
      server.server.onclose = async () => {
        await cleanup();
        await server.close();
        process.exit(0);
      };
    });
    
    app.post("/message", async (req, res) => {
      console.log("Received SSE message");
      await sseTransport.handlePostMessage(req, res);
    });
  }
  
  if (transportType === 'streamableHttp') {
    // Setup for StreamableHTTP transport
    const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};
    
    app.post('/mcp', async (req: any, res: any) => {
      console.log('Received MCP POST request');
      try {
        // Check for existing session ID
        const sessionId = req.headers['mcp-session-id'] as string | undefined;
        let transport: StreamableHTTPServerTransport;
        
        if (sessionId && transports[sessionId]) {
          // Reuse existing transport
          transport = transports[sessionId];
        } else if (!sessionId) {
          // New initialization request
          const eventStore = new InMemoryEventStore();
          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            eventStore, // Enable resumability
            onsessioninitialized: (sessionId) => {
              console.log(`Session initialized with ID: ${sessionId}`);
              transports[sessionId] = transport;
            }
          });
          
          // Set up onclose handler to clean up transport when closed
          transport.onclose = () => {
            const sid = transport.sessionId;
            if (sid && transports[sid]) {
              console.log(`Transport closed for session ${sid}, removing from transports map`);
              delete transports[sid];
            }
          };
          
          // Connect the transport to the MCP server
          await server.connect(transport);
          
          await transport.handleRequest(req, res);
          return;
        } else {
          // Invalid request - no session ID or not initialization request
          res.status(400).json({
            jsonrpc: '2.0',
            error: {
              code: -32000,
              message: 'Bad Request: No valid session ID provided',
            },
            id: req?.body?.id,
          });
          return;
        }
        
        // Handle the request with existing transport
        await transport.handleRequest(req, res);
      } catch (error) {
        console.error('Error handling MCP request:', error);
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: '2.0',
            error: {
              code: -32603,
              message: 'Internal server error',
            },
            id: req?.body?.id,
          });
        }
      }
    });
    
    // Handle GET requests for SSE streams
    app.get('/mcp', async (req: any, res: any) => {
      console.log('Received MCP GET request');
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      if (!sessionId || !transports[sessionId]) {
        res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Bad Request: No valid session ID provided',
          },
          id: req?.body?.id,
        });
        return;
      }
      
      const transport = transports[sessionId];
      await transport.handleRequest(req, res);
    });
    
    // Handle DELETE requests for session termination
    app.delete('/mcp', async (req: any, res: any) => {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      if (!sessionId || !transports[sessionId]) {
        res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Bad Request: No valid session ID provided',
          },
          id: req?.body?.id,
        });
        return;
      }
      
      console.log(`Received session termination request for session ${sessionId}`);
      
      try {
        const transport = transports[sessionId];
        await transport.handleRequest(req, res);
      } catch (error) {
        console.error('Error handling session termination:', error);
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: '2.0',
            error: {
              code: -32603,
              message: 'Error handling session termination',
            },
            id: req?.body?.id,
          });
        }
      }
    });
  }
  
  // Add STDIO transport handling
  if (transportType === 'stdio') {
    // STDIO transport is handled differently, as it uses stdin/stdout
    const stdioTransport = new StdioServerTransport();
    server.connect(stdioTransport).catch(error => {
      console.error("Error connecting STDIO transport:", error);
    });
  }
  
  // Handle static file serving and SPA navigation based on mode
  if (isDev) {
    // In development mode, use Vite's dev server middleware
    try {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
        root: __dirname
      });
      
      // Use Vite's middleware for dev server with HMR
      app.use(vite.middlewares);
      
      console.log("Using Vite middleware in development mode");
    } catch (err) {
      console.error("Error setting up Vite middleware:", err);
      process.exit(1);
    }
  } else {
    // In production mode, serve static files from dist directory
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    
    // For any other route in production, serve the index.html file (for SPA navigation)
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const startWebServer = () => {
    if (!webServer) {
      webServer = app.listen(webAppPort, () => {
        console.log(`Server running at http://localhost:${webAppPort}`);
        console.log(`Transport type: ${transportType}`);
        console.log(`Mode: ${isDev ? 'development' : 'production'}`);
      });
    }
  };

  const cleanup = async () => {
    if (webServer) {
      console.log('Shutting down web server...');
      // improve mcp server & express shutdown handling
    }
  };
  
  startWebServer();
  return { server, cleanup, app };  
}
