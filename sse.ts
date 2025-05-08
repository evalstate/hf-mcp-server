import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
import { createServer } from "./mcp-server.js";

console.error('Starting SSE server...');

const app = express();


let transport: SSEServerTransport;


// Configuration with separate ports for MCP API and web app
const MCP_PORT = process.env.MCP_PORT ? parseInt(process.env.MCP_PORT) : 3001;
const WEB_APP_PORT = process.env.WEB_APP_PORT ? parseInt(process.env.WEB_APP_PORT) : 3000;
const { server, cleanup } = createServer("sse", WEB_APP_PORT);

app.get("/sse", async (req, res) => {
  console.log("Received connection");
  transport = new SSEServerTransport("/message", res);
  await server.connect(transport);

  server.server.onclose = async () => {
    await cleanup();
    await server.close();
    process.exit(0);
  };
});

app.post("/message", async (req, res) => {
  console.log("Received message");

  await transport.handlePostMessage(req, res);
});

// Start the MCP API server
app.listen(MCP_PORT, () => {
  console.log(`SSE Server listening on port ${MCP_PORT}`);
  console.log(`React application available at http://localhost:${WEB_APP_PORT}`);
});

// Handle server shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down server...');
  await cleanup();
  await server.close();
  console.log('Server shutdown complete');
  process.exit(0);
});
