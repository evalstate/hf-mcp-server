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

console.error("Starting Streamable HTTP server...");

// Set development mode environment variable
process.env.NODE_ENV = process.env.NODE_ENV || "production";

// Configuration with single port for both the web app and MCP API
const WEB_APP_PORT = parseInt(argv.port);

// Start the server (async)
async function start() {
  const { server, cleanup } = await createServer(
    "streamableHttp",
    WEB_APP_PORT
  );

  // Handle server shutdown
  process.on("SIGINT", async () => {
    console.log("Shutting down server...");
    await cleanup();
    await server.close();
    console.log("Server shutdown complete");
    process.exit(0);
  });
}

// Run the async start function
start().catch((error) => {
  console.error("Server startup error:", error);
  process.exit(1);
});
