# hf-mcp-server packages

## Quick Guide

This repo contains:

 - (`/mcp`) MCP Implementations of Hub API and Search endpoints for integration with MCP Servers. 
 - (`/app`) An MCP Server and Web Application for deploying endpoints.

### MCP Server

The following transports are supported:

- STDIO 
- SSE (To be deprecated, but still commonly deployed).
- StreamableHTTP
- StreamableHTTP in Stateless JSON Mode (**StreamableHTTPJson**)

The Web Application and HTTP Transports start by default on Port 3000. 

SSE and StreamableHTTP services are available at `/sse` and `/mcp` respectively. Although though not strictly enforced by the specification this is common convention.

> [!TIP]
> The Web Application allows you to switch tools on and off. For STDIO, SSE and StreamableHTTP this will send a ToolListChangedNotification to the MCP Client. In StreamableHTTPJSON mode the tool will not be listed when the client next requests the tool lists.


## Development

This project uses `pnpm` for build and development. 

`pnpm run clean` -> clean build artifacts

`pnpm run build` -> build packages

`pnpm run start` -> start the mcp server application

`pnpm run buildrun` -> clean, build and start

`pnpm run dev` -> concurrently watch `mcp` and start dev server with HMR


## Docker Build

Build the image:
```bash
docker build -t hf-mcp-server .
```

Run with default settings (Streaming HTTP JSON Mode), Dashboard on Port 3000:
```bash
docker run --rm -p 3000:3000 -e DEFAULT_HF_TOKEN=hf_xxx hf-mcp-server
```

Run STDIO MCP Server:
```bash
docker run -i --rm -e TRANSPORT=stdio -p 3000:3000 -e DEFAULT_HF_TOKEN=hf_xxx hf-mcp-server
```

`TRANSPORT` can be `stdio`, `sse`, `streamingHttp` or `streamingHttpJson` (default).

### Transport Endpoints

The different transport types use the following endpoints:
- SSE: `/sse` (with message endpoint at `/message`)
- Streamable HTTP: `/mcp` (regular or JSON mode)
- STDIO: Uses stdin/stdout directly, no HTTP endpoint

### Environment Variables

The server respects the following environment variables:
- `TRANSPORT`: The transport type to use (stdio, sse, streamableHttp, or streamableHttpJson)
- `DEFAULT_HF_TOKEN`: ⚠️ Requests are serviced with the HF_TOKEN received in the Authorization: Bearer header. The DEFAULT_HF_TOKEN is used if no header was sent. Only set this in Development / Test environments or for local STDIO Deployments. ⚠️
- If running with `stdio` transport, `HF_TOKEN` is used if `DEFAULT_HF_TOKEN` is not set.
- `HF_API_TIMEOUT`: Timeout for Hugging Face API requests in milliseconds (default: 12500ms / 12.5 seconds)
- `USER_CONFIG_API`: URL to use for User settings (defaults to Local front-end)
- `MCP_STRICT_COMPLIANCE`: set to True for GET 405 rejects in JSON Mode (default serves a welcome page).
