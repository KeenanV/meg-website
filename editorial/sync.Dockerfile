FROM node:25-bookworm-slim@sha256:81db02c4b671288a03915da9534dbd54f96d0e7c24d80ccc54f5b36b2e684370
# Refresh security updates in the pinned OS snapshot during each rebuild.
RUN apt-get update && apt-get upgrade -y && rm -rf /var/lib/apt/lists/*
WORKDIR /app/apps/studio
COPY apps/studio/package*.json ./
RUN npm ci --omit=dev
COPY apps/studio/ ./
COPY shared/ /app/shared/
RUN mkdir -p .sanity tmp && chown node:node .sanity tmp
WORKDIR /app/apps/backend
COPY apps/backend/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY apps/backend/src ./src
ENV NODE_ENV=production SANITY_STUDIO_DATASET=staging
RUN find /app -path '*/node_modules' -prune -o -type d -exec chmod a+rx {} + -o -type f -exec chmod a+r {} + && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx /opt/yarn-*
USER node
ENTRYPOINT ["node"]
CMD ["src/sync-job.mjs"]
