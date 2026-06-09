FROM node:24-alpine
WORKDIR /app

# Install tini for proper signal forwarding (SIGTERM → Node)
RUN apk add --no-cache tini

# Copy dependency manifests first (layer caching)
COPY package*.json ./
RUN npm ci

# Copy application code
COPY . .

# Compile TypeScript to JavaScript for production
RUN npm run build

# Remove devDependencies (test runners, type defs, etc.) to slim the image
RUN npm prune --omit=dev

# Ensure the data directory exists for SQLite persistence
RUN mkdir -p /app/data

# Switch to the built-in node user (non-root) for security
RUN chown -R node:node /app
USER node

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]
