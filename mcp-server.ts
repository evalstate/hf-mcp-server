#!/usr/bin/env node

import express from "express";
import path, { format } from "path";
import { fileURLToPath } from "url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
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

// server.tool("gradio_endpoint_integration", {
//   endpoint: z.string()
// });

async function main() {
  const transport = new StdioServerTransport();

  async function handleShutdown(reason = "unknown") {
    console.error(`Initiating shutdown (reason: ${reason})`);

    try {
      await transport.close();
      process.exit(0);
    } catch (error) {
      console.error("Error during shutdown:", error);
      process.exit(1);
    }
  }

  // Handle transport closure (not called by Claude Desktop)
  transport.onclose = () => {
    handleShutdown("transport closed");
  };

  // Handle stdin/stdout events
  process.stdin.on("end", () => handleShutdown("stdin ended")); // claude desktop on os x does this
  process.stdin.on("close", () => handleShutdown("stdin closed"));
  process.stdout.on("error", () => handleShutdown("stdout error"));
  process.stdout.on("close", () => handleShutdown("stdout closed"));

  try {
    await server.connect(transport);
    console.error("Server connected");
  } catch (error) {
    console.error("Failed to connect server:", error);
    handleShutdown("connection failed");
  }
}

// Call the main function to start the server
main().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
