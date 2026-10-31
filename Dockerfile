# Stage 1: Build
FROM node:24-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --ignore-scripts

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Stage 2: Production dependencies only
FROM node:24-alpine AS deps

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Stage 3: Run
FROM node:24-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY --from=deps --chown=root:root /app/package*.json ./
COPY --from=deps --chown=root:root /app/node_modules ./node_modules
COPY --from=builder --chown=root:root /app/dist ./dist

# OpenShift runs containers with a random UID and GID 0. Give group 0 the same
# access as the owner so any UID in group 0 can read the app and config.
# The app only needs read access; nothing is writable at runtime.
RUN mkdir config \
    && chgrp -R 0 /app \
    && chmod -R g=u /app
VOLUME ["/app/config"]

# Numeric UID so Kubernetes/OpenShift can verify runAsNonRoot
USER 1000

CMD ["node", "dist/index.js"]
