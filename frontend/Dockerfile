# Frontend Dockerfile for Google Cloud Run
# Multi-stage build for optimized production image

# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app/frontend

# Copy package files
COPY package*.json ./

# Install all dependencies including devDependencies (needed for Vite build)
# Ensure NODE_ENV is not set to production so devDependencies are installed
RUN npm config set registry https://registry.npmjs.org/ && \
    npm config set fetch-retries 5 && \
    npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000 && \
    npm ci --no-audit --no-fund --ignore-scripts

# Copy application code
COPY . .

# Verify index.html exists (required for Vite build)
RUN if [ ! -f "index.html" ]; then \
      echo "❌ ERROR: index.html not found in build context!" && \
      echo "Current directory: $(pwd)" && \
      echo "Files in current directory:" && \
      ls -la && \
      exit 1; \
    else \
      echo "✓ index.html found successfully"; \
    fi

# Build argument for API URL (set at build time)
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}

# Debug: Show environment variables
RUN echo "VITE_API_URL=$VITE_API_URL" && \
    node -v && npm -v && \
    ls -la && ls -la node_modules/@vitejs || true

# Build the application
RUN npm run build || ( \
    echo "❌ Build failed!" && \
    echo "VITE_API_URL=$VITE_API_URL" && \
    echo "Current directory: $(pwd)" && \
    echo "Checking for index.html:" && \
    ls -la index.html || echo "index.html not found!" && \
    echo "Files in current directory:" && \
    ls -la && \
    echo "Checking package.json..." && \
    cat package.json && \
    exit 1 )

# Stage 2: Production
FROM nginx:alpine

# Copy built files from builder stage
COPY --from=builder /app/frontend/dist /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 8080 (Cloud Run requirement)
EXPOSE 8080

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
