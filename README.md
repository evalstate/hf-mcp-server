# HF Services MCP Server

## Docker Usage

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

