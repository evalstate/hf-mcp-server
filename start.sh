#!/bin/sh

# Default to stdio transport if not specified
TRANSPORT="${TRANSPORT:-stdio}"
# Get port from environment or use default
PORT="${PORT:-3000}"
# Other options
JSON_MODE="${JSON_MODE:-false}"

# Only echo if not using stdio transport
if [ "$TRANSPORT" != "stdio" ]; then
  echo "Starting MCP server with transport type: $TRANSPORT on port $PORT"

  # Check for HF_TOKEN
  if [ -n "$HF_TOKEN" ]; then
    echo "HF_TOKEN found in environment"
  else
    echo "Warning: HF_TOKEN not found in environment"
  fi
fi

cd packages/app

DIST_PATH="dist/server"

# Start the appropriate server based on transport type
case "$TRANSPORT" in
  stdio)
    node $DIST_PATH/stdio.js --port "$PORT"
    ;;
  sse)
    node $DIST_PATH/sse.js --port "$PORT"
    ;;
  streamableHttp)
    # Check if JSON mode is enabled
    if [ "$JSON_MODE" = "true" ]; then
      echo "JSON response mode enabled"
      node $DIST_PATH/streamableHttp.js --port "$PORT" --json
    else
      node $DIST_PATH/streamableHttp.js --port "$PORT"
    fi
    ;;
  streamableHttpJson)
    echo "Using streamableHttpJson transport type (JSON response mode enabled)"
    node $DIST_PATH/streamableHttp.js --port "$PORT" --json
    ;;
  *)
    echo "Error: Invalid transport type '$TRANSPORT'. Valid options are: stdio, sse, streamableHttp, streamableHttpJson"
    exit 1
    ;;
esac