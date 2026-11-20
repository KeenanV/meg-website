FROM node:24-trixie-slim@sha256:af02d57b57719b9657a45199a79264a9437940cd55b3c7b3fc99615654f124a0
# Refresh security updates in the pinned OS snapshot during each rebuild.
RUN apt-get update && apt-get upgrade -y && rm -rf /var/lib/apt/lists/*
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
RUN find /app -path '*/node_modules' -prune -o -type d -exec chmod a+rx {} + -o -type f -exec chmod a+r {} + && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx /opt/yarn-*
USER node
CMD ["node", "editorial/server.mjs"]
