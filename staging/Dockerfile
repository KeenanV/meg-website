FROM node:26-bookworm-slim@sha256:298992629d69bbd5b2b03ad57094d8e4fcb3a8eeb7c4e25d29de656519568913
# Refresh security updates in the pinned OS snapshot during each rebuild.
RUN apt-get update && apt-get upgrade -y && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src
COPY site ./site
RUN find /app -path '*/node_modules' -prune -o -type d -exec chmod a+rx {} + -o -type f -exec chmod a+r {} + && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx /opt/yarn-*
USER node
CMD ["node", "src/staging-server.mjs"]
