# Testing Bouquet Feature

## How to test the spaces bouquet

1. Start the server:
```bash
npm start
```

2. Connect an MCP client with the bouquet parameter:

### For SSE transport:
```
http://localhost:3000/sse?bouquet=spaces
```

### For Streamable HTTP transport:
```
http://localhost:3000/mcp?bouquet=spaces
```

### For Stateless HTTP (JSON-RPC) transport:
```
POST http://localhost:3000/mcp?bouquet=spaces
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "method": "initialize",
  "params": {
    "protocolVersion": "0.1.0",
    "clientInfo": {
      "name": "test-client",
      "version": "1.0.0"
    }
  },
  "id": 1
}
```

## Expected behavior:

When connecting with `?bouquet=spaces`, only these tools should be enabled:
- `space_search` - Find Gradio Hugging Face Spaces
- `duplicate_space` - Duplicate any Hugging Face Space to your account

All other tools should be disabled:
- `model_search` ❌
- `model_detail` ❌
- `paper_search` ❌
- `dataset_search` ❌
- `dataset_detail` ❌

## What to look for in the logs:

You should see log entries like:
```
info: Bouquet parameter received {"bouquet":"spaces"}
info: Tool state set by bouquet {"toolName":"space_search","bouquet":"spaces","isEnabled":true}
info: Tool state set by bouquet {"toolName":"duplicate_space","bouquet":"spaces","isEnabled":true}
info: Tool state set by bouquet {"toolName":"model_search","bouquet":"spaces","isEnabled":false}
...
```

## Adding more bouquets:

To add more bouquets, edit the `BOUQUETS` object in `/packages/app/src/server/mcp-server.ts`:

```typescript
const BOUQUETS: Record<string, string[]> = {
    spaces: ['space_search', 'duplicate_space'],
    models: ['model_search', 'model_detail'],
    research: ['paper_search', 'dataset_search', 'dataset_detail'],
    // Add more bouquets here
};
```