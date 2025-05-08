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

// async function main() {
//   const transport = new StdioServerTransport();

//   async function handleShutdown(reason = "unknown") {
//     console.error(`Initiating shutdown (reason: ${reason})`);

//     try {
//       await transport.close();
//       process.exit(0);
//     } catch (error) {
//       console.error("Error during shutdown:", error);
//       process.exit(1);
//     }
//   }

//   // Handle transport closure (not called by Claude Desktop)
//   transport.onclose = () => {
//     handleShutdown("transport closed");
//   };

//   // Handle stdin/stdout events
//   process.stdin.on("end", () => handleShutdown("stdin ended")); // claude desktop on os x does this
//   process.stdin.on("close", () => handleShutdown("stdin closed"));
//   process.stdout.on("error", () => handleShutdown("stdout error"));
//   process.stdout.on("close", () => handleShutdown("stdout closed"));

//   try {
//     await server.connect(transport);
//     console.error("Server connected");
//   } catch (error) {
//     console.error("Failed to connect server:", error);
//     handleShutdown("connection failed");
//   }
// }

// // Call the main function to start the server
// main().catch((error) => {
//   console.error("Unhandled error:", error);
//   process.exit(1);
// });

const app = express();
app.use(express.json());

app.use((req, res, next) => {
  next();
});

const transports = {
  streamable: {} as Record<string, StreamableHTTPServerTransport>,
  sse: {} as Record<string, SSEServerTransport>,
};

// Streamable HTTP endpoint placeholder
app.all("/mcp", async (req, res) => {
  console.log(`[MCP HTTP] ${req.method} ${req.originalUrl}`);
});

// SSE endpoint
app.get("/sse", async (req, res) => {
  console.log(`[SSE] New connection from ${req.ip}`);
  const transport = new SSEServerTransport("/messages", res);
  transports.sse[transport.sessionId] = transport;
  res.on("close", () => {
    delete transports.sse[transport.sessionId];
  });
  await server.connect(transport);
});

// Message endpoint
app.post("/messages", async (req, res) => {
  const sessionId = req.query.sessionId as string;
  const transport = transports.sse[sessionId];
  if (transport) {
    await transport.handlePostMessage(req, res, req.body);
  } else {
    res.status(400).send("No transport found for sessionId");
  }
});

// Start server
app.listen(8080, () => {
  console.log(`Server listening on port 8080`);
});
