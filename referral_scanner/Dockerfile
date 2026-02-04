FROM node:18-bullseye-slim

WORKDIR /app

RUN apt-get update && \
    apt-get install -y --no-install-recommends clamav && \
    rm -rf /var/lib/apt/lists/*

# Update virus definitions during build (best-effort).
RUN freshclam || echo "freshclam failed; will rely on base definitions"

COPY package*.json ./
RUN npm ci --omit=dev

COPY index.js ./

ENV NODE_ENV=production

EXPOSE 8080

CMD ["npm", "start"]
