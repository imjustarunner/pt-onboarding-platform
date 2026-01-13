# Frontend Dockerfile for Google Cloud Run
# Multi-stage build for optimized production image

# Stage 1: Build
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies including devDependencies (needed for Vite build)
# Ensure NODE_ENV is not set to production so devDependencies are installed
RUN npm ci

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
ENV NODE_ENV=production

# Debug: Show environment variables
RUN echo "VITE_API_URL=$VITE_API_URL" && \
    echo "NODE_ENV=$NODE_ENV" && \
    node -v && npm -v && \
    ls -la && ls -la node_modules/@vitejs || true

# Build the application with better error visibility
RUN npm run build 2>&1 | tee build.log || ( \
    echo "❌ Build failed! Showing build output:" && \
    cat build.log && \
    echo "--- Environment ---" && \
    echo "VITE_API_URL=$VITE_API_URL" && \
    echo "NODE_ENV=$NODE_ENV" && \
    echo "--- Files ---" && \
    ls -la && \
    echo "--- index.html check ---" && \
    [ -f index.html ] && echo "✓ index.html exists" || echo "✗ index.html missing" && \
    exit 1 )

# Stage 2: Production
FROM nginx:alpine

# Copy built files from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 8080 (Cloud Run requirement)
EXPOSE 8080

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
