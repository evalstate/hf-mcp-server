import { BaseTransport, TransportOptions } from "./base-transport.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";

/**
 * Implementation of SSE transport
 */
export class SseTransport extends BaseTransport {
  private transport: SSEServerTransport | null = null;

  async initialize(options: TransportOptions): Promise<void> {
    // Add SSE endpoints to the Express app
    this.app.get("/sse", async (req, res) => {
      console.log("Received SSE connection");
      // Set the correct content type for SSE
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      this.transport = new SSEServerTransport("/message", res);
      await this.server.connect(this.transport);

      this.server.server.onclose = async () => {
        await this.cleanup();
        await this.server.close();
        process.exit(0);
      };
    });

    this.app.post("/message", async (req, res) => {
      console.log("Received SSE message");
      if (this.transport) {
        await this.transport.handlePostMessage(req, res);
      } else {
        res.status(500).json({
          error: "SSE transport not initialized"
        });
      }
    });

    console.log("SSE transport routes initialized");
  }

  async cleanup(): Promise<void> {
    console.log("Cleaning up SSE transport");
    // SSE doesn't require special cleanup beyond what the server will do
  }
}