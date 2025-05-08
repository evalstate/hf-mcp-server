#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./mcp-server.js";

console.error('Starting default (STDIO) server...');
const WEB_APP_PORT = process.env.WEB_APP_PORT ? parseInt(process.env.WEB_APP_PORT) : 3000;

async function main() {
  const transport = new StdioServerTransport();
  const { server, cleanup } = createServer('stdio', WEB_APP_PORT);

  await server.connect(transport);

  // Cleanup on exit
  process.on("SIGINT", async () => {
    await cleanup();
    await server.close();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});

