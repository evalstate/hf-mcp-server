FROM node:22-alpine

RUN corepack enable pnpm

WORKDIR /app

# Copy package files and install dependencies
COPY pnpm-workspace.yaml pnpm-lock.yaml package*.json ./
RUN pnpm install --frozen-lockfile
# Copy source code
COPY . .

# Build the application
RUN pnpm run build

# Make startup script executable
RUN chmod +x start.sh

# Set environment variables
ENV NODE_ENV=production
# Default to HTTP transport - can be overridden at runtime
ENV TRANSPORT_TYPE=streamableHttp
# Default port - can be overridden at runtime
ENV PORT=3000
# HF_TOKEN can be provided at runtime

# Expose port
EXPOSE 3000

# Run the startup script
CMD ["./start.sh"]
