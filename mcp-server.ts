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

// Track the active transport type
export type TransportType = 'stdio' | 'sse' | 'streamableHttp' | 'unknown';
let activeTransport: TransportType = 'unknown';

// Create an Express app to serve the React frontend and provide transport info
const app = express();
let webServer: any = null;

export const createServer = (transportType: TransportType = 'unknown', webAppPort: number = 3000) => {
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
  activeTransport = transportType;
  // Define the semantic search tool using our service
  server.tool(
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

  // Serve the React app from the dist directory
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const distPath = path.join(__dirname);
  
  app.use(express.static(distPath));
  
  // API endpoint to get the active transport
  app.get('/api/transport', (req, res) => {
    res.json({ transport: activeTransport });
  });
  
  // For any other route, serve the index.html file (for SPA navigation)
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });

  app.use(express.static(distPath));
  
  // API endpoint to get the active transport
  app.get('/api/transport', (req, res) => {
    res.json({ transport: activeTransport });
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
