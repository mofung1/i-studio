FROM --platform=$BUILDPLATFORM node:22-bookworm-slim AS build
WORKDIR /admin
RUN corepack enable
COPY admin/package.json admin/pnpm-lock.yaml ./
RUN --mount=type=cache,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile
COPY admin/ ./
ARG VITE_WEB_ORIGIN
ENV VITE_WEB_ORIGIN=$VITE_WEB_ORIGIN
RUN pnpm build

FROM caddy:2-alpine
COPY --from=build /admin/dist /srv/admin
COPY docker/Caddyfile.admin /etc/caddy/Caddyfile
COPY docker/admin-routes.caddy /etc/caddy/admin-routes.caddy
COPY admin/LICENSE.shadcn-admin /usr/share/licenses/istudio/LICENSE.shadcn-admin
EXPOSE 8080
