
FROM node:22-alpine

RUN corepack enable pnpm

WORKDIR /app

# Copy package files and install dependencies
COPY pnpm-workspace.yaml pnpm-lock.yaml package*.json ./
COPY packages/mcp/package.json ./packages/mcp/
COPY packages/app/package.json ./packages/app/

RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .


# Clean any existing build artifacts to prevent export issues
RUN rm -rf ./packages/mcp/dist ./packages/app/dist && \
    echo "=== Cleaned build artifacts ==="

# Build the application with debugging
RUN echo "=== Starting build process ===" && \
    pnpm run build && \
    echo "=== Build completed, checking structure ==="

# Try building web separately to catch any errors
RUN cd packages/app && \
    echo "=== Building web separately ===" && \
    pnpm run build:web && \
    echo "=== Web build completed ==="

# Debug: List what was actually built
RUN echo "=== Full package structure ===" && \
    find packages/app -name "dist" -type d && \
    echo "=== Contents of packages/app/dist ===" && \
    ls -la packages/app/dist/ || echo "packages/app/dist does not exist" && \
    echo "=== Contents of packages/app/dist/web (if exists) ===" && \
    ls -la packages/app/dist/web/ || echo "packages/app/dist/web does not exist" && \
    echo "=== Contents of packages/app/dist/server (if exists) ===" && \
    ls -la packages/app/dist/server/ || echo "packages/app/dist/server does not exist" && \
    echo "=== Looking for any index.html files ===" && \
    find packages/app -name "index.html" -type f


# Build the application
# RUN pnpm run build 
# RUN chmod +x start.sh

# Set working directory to where the built app is
WORKDIR /app

# Set environment variables
ENV NODE_ENV=production
ENV TRANSPORT=streamableHttp
ENV PORT=3000

# Expose port
EXPOSE 3000

# Run the startup script
CMD ["/bin/sh", "./start.sh"]
