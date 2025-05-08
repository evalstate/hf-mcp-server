FROM node:22-alpine

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Make startup script executable
RUN chmod +x start.sh

# Set environment variables
ENV NODE_ENV=production
# Default to SSE transport - can be overridden at runtime
ENV TRANSPORT_TYPE=sse
# Default ports - can be overridden at runtime
ENV WEB_APP_PORT=3000
ENV MCP_PORT=3001
# HF_TOKEN can be provided at runtime

# Expose ports
EXPOSE 3000
EXPOSE 3001

# Run the startup script
CMD ["./start.sh"]
