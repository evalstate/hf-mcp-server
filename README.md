# HF Services MCP Server

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
node dist/stdio.js

# For SSE transport (for web applications)
node dist/sse.js

# For Streamable HTTP transport
node dist/streamableHttp.js
```

### Command Line Arguments

You can specify the port to use via command line arguments:

```bash
# Run with a specific port
node dist/sse.js --port 8080
# or with shorthand
node dist/sse.js -p 8080
```

### Environment Variables

The server respects the following environment variables:
- `PORT` or `WEB_APP_PORT`: The port to run the server on (default: 3000)
- `TRANSPORT_TYPE`: The transport type to use (stdio, sse, or streamableHttp)
- `HF_TOKEN`: Your Hugging Face API token

### Transport Endpoints

The different transport types use the following endpoints:
- SSE: `/sse` (with message endpoint at `/message`)
- Streamable HTTP: `/mcp`
- STDIO: Uses stdin/stdout directly, no HTTP endpoint

## Design Notes

