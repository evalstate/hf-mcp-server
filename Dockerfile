
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

# Build the application
RUN pnpm run build
RUN chmod +x start.sh

# Set working directory to where the built app is
WORKDIR /app

# Set environment variables
ENV NODE_ENV=production
ENV TRANSPORT_TYPE=streamableHttp
ENV PORT=3000

# Expose port
EXPOSE 3000

# Run the startup script
CMD ["./start.sh"]
