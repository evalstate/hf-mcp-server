#!/bin/bash
# Start server with test environment variables from .env.test

# Load variables from .env.test if it exists
if [ -f .env.test ]; then
    echo "Loading environment from .env.test..."
    set -a
    source .env.test
    set +a
else
    echo "No .env.test found, using defaults..."
fi

echo "Starting server with test configuration..."
pnpm start:json

