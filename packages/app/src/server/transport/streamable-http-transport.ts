import { BaseTransport, TransportOptions } from "./base-transport.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { InMemoryEventStore } from "@modelcontextprotocol/sdk/examples/shared/inMemoryEventStore.js";
import { randomUUID } from "node:crypto";

/**
 * Implementation of StreamableHTTP transport
 */
export class StreamableHttpTransport extends BaseTransport {
  private transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

  async initialize(options: TransportOptions): Promise<void> {
    const { enableJsonResponse = false } = options;
    
    // Handle POST requests for JSON-RPC
    this.app.post("/mcp", async (req: any, res: any) => {
      console.log("Received MCP POST request");
      try {
        // Check for existing session ID
        const sessionId = req.headers["mcp-session-id"] as string | undefined;
        let transport: StreamableHTTPServerTransport;

        if (sessionId && this.transports[sessionId]) {
          // Reuse existing transport
          transport = this.transports[sessionId];
        } else if (!sessionId) {
          // New initialization request
          const eventStore = new InMemoryEventStore();
          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            enableJsonResponse, // Add JSON mode toggle
            eventStore, // Enable resumability
            onsessioninitialized: (sessionId) => {
              console.log(`Session initialized with ID: ${sessionId}`);
              this.transports[sessionId] = transport;
            },
          });

          // Set up onclose handler to clean up transport when closed
          transport.onclose = () => {
            const sid = transport.sessionId;
            if (sid && this.transports[sid]) {
              console.log(
                `Transport closed for session ${sid}, removing from transports map`
              );
              delete this.transports[sid];
            }
          };

          // Connect the transport to the MCP server
          await this.server.connect(transport);

          await transport.handleRequest(req, res);
          return;
        } else {
          // Invalid request - no session ID or not initialization request
          res.status(400).json({
            jsonrpc: "2.0",
            error: {
              code: -32000,
              message: "Bad Request: No valid session ID provided",
            },
            id: req?.body?.id,
          });
          return;
        }

        // Handle the request with existing transport
        await transport.handleRequest(req, res);
      } catch (error) {
        console.error("Error handling MCP request:", error);
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: "2.0",
            error: {
              code: -32603,
              message: "Internal server error",
            },
            id: req?.body?.id,
          });
        }
      }
    });

    // Handle GET requests for SSE streams
    this.app.get("/mcp", async (req: any, res: any) => {
      console.log("Received MCP GET request");
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      if (!sessionId || !this.transports[sessionId]) {
        res.status(400).json({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "Bad Request: No valid session ID provided",
          },
          id: req?.body?.id,
        });
        return;
      }

      const transport = this.transports[sessionId];
      await transport.handleRequest(req, res);
    });

    // Handle DELETE requests for session termination
    this.app.delete("/mcp", async (req: any, res: any) => {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      if (!sessionId || !this.transports[sessionId]) {
        res.status(400).json({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "Bad Request: No valid session ID provided",
          },
          id: req?.body?.id,
        });
        return;
      }

      console.log(
        `Received session termination request for session ${sessionId}`
      );

      try {
        const transport = this.transports[sessionId];
        await transport.handleRequest(req, res);
      } catch (error) {
        console.error("Error handling session termination:", error);
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: "2.0",
            error: {
              code: -32603,
              message: "Error handling session termination",
            },
            id: req?.body?.id,
          });
        }
      }
    });

    console.log("StreamableHTTP transport routes initialized");
    console.log(`JSON Response mode: ${enableJsonResponse ? "enabled" : "disabled"}`);
  }

  async cleanup(): Promise<void> {
    console.log("Cleaning up StreamableHTTP transport");
    
    // Close all active transports
    for (const sessionId in this.transports) {
      const transport = this.transports[sessionId];
      try {
        // The transport may have an onclose handler we need to respect
        if (transport.onclose) {
          transport.onclose();
        }
        delete this.transports[sessionId];
      } catch (error) {
        console.error(`Error closing transport for session ${sessionId}:`, error);
      }
    }
  }
}