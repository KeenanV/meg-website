FROM node:24-bookworm-slim
WORKDIR /app/apps/studio
COPY apps/studio/package*.json ./
RUN npm ci --omit=dev
COPY apps/studio/ ./
COPY shared/ /app/shared/
WORKDIR /app/apps/backend
COPY apps/backend/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY apps/backend/src ./src
ENV NODE_ENV=production SANITY_STUDIO_DATASET=staging
RUN chown -R node:node /app
USER node
ENTRYPOINT ["node"]
CMD ["src/sync-job.mjs"]
