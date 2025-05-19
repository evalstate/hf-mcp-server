#!/usr/bin/env node

import { createServer } from "./mcp-server.js";
import { DEFAULT_WEB_APP_PORT } from "../constants.js";
import minimist from "minimist";

// Parse command line arguments
const argv = minimist(process.argv.slice(2), {
  string: ["port"],
  alias: { p: "port" },
  default: {
    port: process.env.WEB_APP_PORT || DEFAULT_WEB_APP_PORT.toString(),
  },
});

console.error("Starting default (STDIO) server...");

// Set development mode environment variable
process.env.NODE_ENV = process.env.NODE_ENV || "production";

const WEB_APP_PORT = parseInt(argv.port);

async function main() {
  const { server, cleanup } = await createServer("stdio", WEB_APP_PORT);

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
