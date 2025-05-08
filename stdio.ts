#!/usr/bin/env node

import { createServer } from "./mcp-server.js";
import { DEFAULT_WEB_APP_PORT } from "./constants.js";

console.error('Starting default (STDIO) server...');
const WEB_APP_PORT = process.env.WEB_APP_PORT ? parseInt(process.env.WEB_APP_PORT) : DEFAULT_WEB_APP_PORT;

async function main() {
  const { server, cleanup } = createServer('stdio', WEB_APP_PORT);

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

