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



export const createServer = () => {
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

  const cleanup = async () => {
    // tidy up the express server hosting react
  };

  return { server, cleanup };  
}
