#!/bin/sh

# Default to stdio transport if not specified
TRANSPORT_TYPE="${TRANSPORT_TYPE:-stdio}"
# Get port from environment or use default
PORT="${PORT:-3000}"

echo "Starting MCP server with transport type: $TRANSPORT_TYPE on port $PORT"

# Check for HF_TOKEN
if [ -n "$HF_TOKEN" ]; then
  echo "HF_TOKEN found in environment"
else
  echo "Warning: HF_TOKEN not found in environment"
fi

DIST_PATH="packages/app/dist/server"

# Start the appropriate server based on transport type
case "$TRANSPORT_TYPE" in
  stdio)
    node $DIST_PATH/stdio.js --port "$PORT"
    ;;
  sse)
    node $DIST_PATH/sse.js --port "$PORT"
    ;;
  streamableHttp)
    node $DIST_PATH/streamableHttp.js --port "$PORT"
    ;;
  *)
    echo "Error: Invalid transport type '$TRANSPORT_TYPE'. Valid options are: stdio, sse, streamableHttp"
    exit 1
    ;;
esac
