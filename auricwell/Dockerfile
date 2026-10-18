# Build from the repository root: docker build -f auricwell/Dockerfile .
# The office and therapy UI are shared with frontend/src.
FROM node:22-alpine AS build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY frontend/src ./src
COPY frontend/public ./public
WORKDIR /app/auricwell
COPY auricwell/package*.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY auricwell/src ./src
COPY auricwell/public ./public
COPY auricwell/index.html auricwell/vite.config.js auricwell/legal-pages.mjs ./
RUN npm run build
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY auricwell/package*.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY --from=build /app/auricwell/dist ./dist
COPY auricwell/server.js ./
USER node
EXPOSE 8080
CMD ["node", "server.js"]
