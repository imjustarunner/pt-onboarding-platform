# Multi-stage Dockerfile for Google Cloud Run
# Stage 1: Build frontend
FROM node:20-alpine AS frontend-builder

# Install and Build Frontend
WORKDIR /app/frontend

# Copy frontend package files first (for better layer caching)
COPY frontend/package*.json ./

# Install dependencies
RUN npm ci

# Copy all frontend files (including index.html)
# Copy index.html first explicitly to ensure it's present
COPY frontend/index.html ./
# Copy the rest of frontend files
COPY frontend/ ./

# Build argument for API URL (relative path since frontend and backend are same origin)
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL

# Verify index.html exists and show directory structure before building
RUN echo "=== Verifying frontend structure ===" && \
    ls -la && \
    test -f index.html || (echo "ERROR: index.html not found!" && ls -la && exit 1) && \
    echo "✓ index.html found" && \
    echo "=== Frontend files ===" && \
    ls -la src/ 2>/dev/null || echo "src/ directory check" && \
    echo "=== Ready to build ==="

# Build the frontend
RUN npm run build

# Switch back to app root for copying
WORKDIR /app

# Stage 2: Backend with embedded frontend
FROM node:18-alpine

WORKDIR /app

# Install Chromium and dependencies for Puppeteer
# This prevents Puppeteer from downloading Chromium during npm ci (saves ~170MB and build time)
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    && rm -rf /var/cache/apk/*

# Set environment variable to skip Puppeteer's Chromium download
ENV PUPPETEER_SKIP_DOWNLOAD=true

# Detect Chromium executable path (Alpine typically uses chromium-browser, but check both)
# This verifies which executable exists and will be used by the application
RUN which chromium-browser || which chromium || echo "Warning: Chromium executable not found in PATH"

# Set Chromium executable path (default to chromium-browser, most common on Alpine)
# If chromium-browser doesn't exist, the code will fall back to checking chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Copy backend package files
COPY backend/package*.json ./

# Install backend dependencies (production only)
RUN npm ci --only=production

# Copy backend source code
COPY backend/src ./src

# Copy built frontend from builder stage to public directory
COPY --from=frontend-builder /app/frontend/dist ./public

# Verify public directory and index.html exist (fail build if missing)
RUN echo "Verifying public directory..." && \
    ls -la public/ || (echo "ERROR: public/ directory not found!" && exit 1) && \
    echo "=== Contents of public/ ===" && \
    find public -type f || echo "No files found in public/" && \
    test -f public/index.html || (echo "ERROR: public/index.html not found!" && ls -la public/ && exit 1) && \
    echo "Verified: public/index.html exists"

# Expose port (Cloud Run will set PORT env var)
EXPOSE 3000

# Start the application
CMD ["node", "src/server.js"]
