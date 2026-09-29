# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS build
WORKDIR /repo
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/contracts/package.json packages/contracts/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace @bajet/api --workspace @bajet/contracts --include-workspace-root
COPY packages/contracts packages/contracts
COPY apps/api apps/api
RUN npm run build -w @bajet/contracts && npm run build -w @bajet/api

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev --workspace @bajet/api --workspace @bajet/contracts && npm cache clean --force
COPY --from=build /repo/packages/contracts/dist packages/contracts/dist
COPY --from=build /repo/apps/api/dist apps/api/dist
COPY apps/api/docker-entrypoint.sh apps/api/
RUN mkdir -p /var/lib/bajet/files && chown -R node:node /var/lib/bajet && chmod +x apps/api/docker-entrypoint.sh
WORKDIR /repo/apps/api
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=30s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["serve"]
