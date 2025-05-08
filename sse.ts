import { createServer } from "./mcp-server.js";
import { DEFAULT_WEB_APP_PORT } from "./constants.js";

console.error('Starting SSE server...');

// Configuration with single port for both the web app and MCP API
const WEB_APP_PORT = process.env.WEB_APP_PORT ? parseInt(process.env.WEB_APP_PORT) : DEFAULT_WEB_APP_PORT;
const { server, cleanup } = createServer("sse", WEB_APP_PORT);

// Handle server shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down server...');
  await cleanup();
  await server.close();
  console.log('Server shutdown complete');
  process.exit(0);
});
