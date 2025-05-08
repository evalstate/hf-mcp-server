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
docker run -p 3000:3000 -p 3001:3001 hf-mcp-server
```

Run with alternative transport:
```bash
# Use stdio transport
docker run -e TRANSPORT_TYPE=stdio hf-mcp-server

# Use streamableHttp transport
docker run -p 3000:3000 -p 3001:3001 -e TRANSPORT_TYPE=streamableHttp hf-mcp-server
```

With Hugging Face token:
```bash
docker run -p 3000:3000 -p 3001:3001 -e HF_TOKEN=your_token_here hf-mcp-server
```

## Design Notes

