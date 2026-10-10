FROM node:24-bookworm-slim
WORKDIR /app/apps/backend
COPY apps/backend/package*.json ./
RUN npm ci --omit=dev
COPY apps/backend/src ./src
WORKDIR /app/apps/web
COPY apps/web/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY apps/web/dist-preview ./dist-preview
COPY apps/web/editorial ./editorial
ENV NODE_ENV=production
RUN chown -R node:node /app
USER node
CMD ["node", "editorial/server.mjs"]
