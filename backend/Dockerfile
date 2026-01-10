# Backend Dockerfile for Google Cloud Run
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

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Expose port (Cloud Run will set PORT env var)
EXPOSE 3000

# Start the application
CMD ["node", "src/server.js"]
