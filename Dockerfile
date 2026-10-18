# syntax=docker/dockerfile:1.7

FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY frontend-2/package*.json ./
RUN npm ci

FROM deps AS build
COPY frontend-2 ./
RUN npm run build

FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=4000
WORKDIR /app

RUN groupadd --system kpb && useradd --system --gid kpb --home-dir /app kpb

COPY frontend-2/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build --chown=kpb:kpb /app/dist ./dist

USER kpb
EXPOSE 4000
CMD ["node", "dist/frontend-2/server/server.mjs"]

