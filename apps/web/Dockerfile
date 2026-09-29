# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS build
WORKDIR /repo
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/contracts/package.json packages/contracts/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace @bajet/web --workspace @bajet/contracts --include-workspace-root
COPY packages/contracts packages/contracts
COPY apps/web apps/web
RUN npm run build -w @bajet/web

FROM nginx:1.27-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80
