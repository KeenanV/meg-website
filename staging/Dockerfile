FROM node:24-trixie-slim@sha256:4d00acb4bcc42c454c4eb801526f7ad7f772ea3bd4fd168c5cc2e384abcbb9d4
# Refresh security updates in the pinned OS snapshot during each rebuild.
# v1.0.1 OS baseline: rebuild the package layer and require patched glibc.
RUN apt-get update && apt-get upgrade -y \
    && dpkg --compare-versions "$(dpkg-query -W -f='${Version}' libc6)" ge '2.41-12+deb13u5' \
    && dpkg --compare-versions "$(dpkg-query -W -f='${Version}' libc-bin)" ge '2.41-12+deb13u5' \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src
COPY site ./site
RUN find /app -path '*/node_modules' -prune -o -type d -exec chmod a+rx {} + -o -type f -exec chmod a+r {} + && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx /opt/yarn-*
USER node
CMD ["node", "src/staging-server.mjs"]
