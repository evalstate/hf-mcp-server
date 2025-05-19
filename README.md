# HF Services MCP Server

## Quick Guide

This repo contains:

 - MCP Tool Implementations for connecting to the HuggingFace API for integration to an MCP Server
 - A Web Application and set of Transports for deploying the MCP Server.

The following modes are supported:

- STDIO 
- SSE (To be deprecated, but still commonly deployed).
- StreamableHTTP
- StreamableHTTP in Stateless JSON Mode (**StreamableHTTPJson**)

The Web Application and HTTP Transports start by default on Port 3000. 

SSE and StreamableHTTP services are available at `/sse` and `/mcp` respectively. Although though not strictly enforced by the specification this is common convention.

> [!TIP]
> The Web Application allows you to switch tools on and off. For STDIO, SSE and StreamableHTTP this will send a ToolListChangedNotification to the MCP Client. In StreamableHTTPJSON mode the tool will not be listed when the client next requests the tool lists.

## Docker Usage

### Using NPM Scripts

We provide several npm scripts to simplify Docker operations:

```bash
# Build the Docker image
npm run docker:build

# Run with default settings (SSE transport)
npm run docker:run

# Run with specific transport types
npm run docker:run:sse
npm run docker:run:stdio
npm run docker:run:streamableHttp
```

These scripts automatically pass your HF_TOKEN environment variable to the container.

### Manual Docker Commands

Build the image:
```bash
docker build -t hf-mcp-server .
```

Run with default settings (SSE transport):
```bash
docker run -p 3000:3000 hf-mcp-server
```

Run with alternative transport:
```bash
# Use stdio transport
docker run -e TRANSPORT_TYPE=stdio hf-mcp-server

# Use streamableHttp transport
docker run -p 3000:3000 -e TRANSPORT_TYPE=streamableHttp hf-mcp-server

# Use streamableHttp transport with JSON mode
docker run -p 3000:3000 -e TRANSPORT_TYPE=streamableHttpJson hf-mcp-server
# Or
docker run -p 3000:3000 -e TRANSPORT_TYPE=streamableHttp -e JSON_MODE=true hf-mcp-server
```

With Hugging Face token:
```bash
docker run -p 3000:3000 -e HF_TOKEN=your_token_here hf-mcp-server
```

Note: The server now runs all services (React app and MCP transport) on a single port (default: 3000).

## Running the Server

You can run the server using one of the following commands:

```bash
# For STDIO transport (for terminal/CLI use)
node dist/server/stdio.js

# For SSE transport (for web applications)
node dist/server/sse.js

# For Streamable HTTP transport
node dist/server/streamableHttp.js

# For Streamable HTTP transport with JSON mode
node dist/server/streamableHttp.js --json
# or with shorthand
node dist/server/streamableHttp.js -j
```

### Command Line Arguments

You can specify the port to use via command line arguments:

```bash
# Run with a specific port
node dist/server/sse.js --port 8080
# or with shorthand
node dist/server/sse.js -p 8080
```

For StreamableHttp transport, you can enable JSON mode:
```bash
node dist/server/streamableHttp.js --json
# or with shorthand
node dist/server/streamableHttp.js -j
```

### Environment Variables

The server respects the following environment variables:
- `PORT` or `WEB_APP_PORT`: The port to run the server on (default: 3000)
- `TRANSPORT_TYPE`: The transport type to use (stdio, sse, streamableHttp, or streamableHttpJson)
- `JSON_MODE`: Set to "true" to enable JSON mode when using streamableHttp transport
- `HF_TOKEN`: Your Hugging Face API token

### Transport Endpoints

The different transport types use the following endpoints:
- SSE: `/sse` (with message endpoint at `/message`)
- Streamable HTTP: `/mcp` (regular or JSON mode)
- STDIO: Uses stdin/stdout directly, no HTTP endpoint

## Transport Types

### StreamableHttp with JSON Mode

The StreamableHttp transport can operate in two modes:
- **Session-Based Mode**: Returns event-stream responses for streaming. Uses sessionIdGenerator for proper SSE handling. Shows a blue "Session Based" badge in the UI.
- **JSON Stateless Mode**: Returns JSON responses, which can be easier to work with in some client implementations. Does not use sessionIdGenerator as it's not needed for JSON responses. Shows a green "JSON (stateless)" badge in the UI.

You can specify JSON mode in several ways:
1. Using the `--json` or `-j` flag when running the server directly
2. Using the `streamableHttpJson` transport type in Docker
3. Setting `JSON_MODE=true` environment variable with `streamableHttp` transport type

### npm Scripts for JSON Mode

The package.json includes dedicated scripts for running in JSON mode:

```bash
# Development with JSON mode
npm run dev:json

# Production with JSON mode
npm run start:json
```

These commands automatically set up the proper flags for enabling JSON response mode.
