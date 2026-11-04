FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY relay.js server.js smtpOptions.js ./
USER node
ENV NODE_ENV=production
CMD ["node", "server.js"]
