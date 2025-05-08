#!/bin/sh

# Default to stdio transport if not specified
TRANSPORT_TYPE="${TRANSPORT_TYPE:-stdio}"
echo "Starting MCP server with transport type: $TRANSPORT_TYPE"

# Check for HF_TOKEN
if [ -n "$HF_TOKEN" ]; then
  echo "HF_TOKEN found in environment"
else
  echo "Warning: HF_TOKEN not found in environment"
fi

# Start the appropriate server based on transport type
case "$TRANSPORT_TYPE" in
  stdio)
    node dist/stdio.js
    ;;
  sse)
    node dist/sse.js
    ;;
  streamableHttp)
    node dist/streamableHttp.js
    ;;
  *)
    echo "Error: Invalid transport type '$TRANSPORT_TYPE'. Valid options are: stdio, sse, streamableHttp"
    exit 1
    ;;
esac