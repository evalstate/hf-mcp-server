import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Express } from "express";
import { TransportType } from "../../constants.js";
import { BaseTransport } from "./base-transport.js";
import { StdioTransport } from "./stdio-transport.js";
import { SseTransport } from "./sse-transport.js";
import { StreamableHttpTransport } from "./streamable-http-transport.js";

/**
 * Factory class for creating transport instances
 */
export class TransportFactory {
  /**
   * Create a transport instance based on the transport type
   */
  static createTransport(
    type: TransportType, 
    server: McpServer, 
    app: Express
  ): BaseTransport {
    switch (type) {
      case "stdio":
        return new StdioTransport(server, app);
      case "sse":
        return new SseTransport(server, app);
      case "streamableHttp":
      case "streamableHttpJson":
        // For both streamableHttp and streamableHttpJson, use same class
        // enableJsonResponse parameter will be passed separately
        return new StreamableHttpTransport(server, app);
      default:
        throw new Error(`Unsupported transport type: ${type}`);
    }
  }
}