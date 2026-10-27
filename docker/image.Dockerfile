# syntax=docker/dockerfile:1
FROM --platform=$BUILDPLATFORM golang:1.27.3-alpine AS api-build
ARG TARGETARCH
WORKDIR /src
COPY server/go.mod server/go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download
COPY server/cmd ./cmd
COPY server/internal ./internal
RUN --mount=type=cache,target=/go/pkg/mod --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=linux GOARCH=$TARGETARCH go build -trimpath -ldflags='-s -w' -o /out/istudio-server ./cmd/server

FROM node:22-bookworm-slim AS web-build
WORKDIR /app
RUN corepack enable
COPY web/package.json web/pnpm-lock.yaml ./
RUN --mount=type=cache,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile
COPY web ./
# An empty browser API base makes the same image work on any IP, port or domain.
ENV NEXT_PUBLIC_API_BASE_URL="" NEXT_PUBLIC_SITE_URL="" SITE_ENV=preview \
    NEXT_STANDALONE=1 NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

FROM caddy:2-alpine AS gateway

FROM node:22-bookworm-slim
ARG VCS_REF=unknown
LABEL org.opencontainers.image.title="iStudio" \
      org.opencontainers.image.description="iStudio web, API and gateway with the public inspiration library" \
      org.opencontainers.image.source="https://github.com/mofung1/i-studio" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.revision=$VCS_REF
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 \
    STORAGE_ROOT=/data/uploads INSTALL_INSPIRATION=true SITE_ENV=preview \
    API_INTERNAL_BASE_URL=http://127.0.0.1:4000 \
    API_HOST=127.0.0.1 API_PORT=4000 HOSTNAME=127.0.0.1 PORT=3000 \
    GENERATION_POLL_TIMEOUT_SECONDS=600
COPY --from=web-build /app/.next/standalone ./
COPY --from=web-build /app/.next/static ./.next/static
COPY --from=web-build /app/public ./public
COPY --from=api-build /out/istudio-server /usr/local/bin/istudio-server
COPY --from=gateway /usr/bin/caddy /usr/local/bin/caddy
COPY --from=gateway /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY server/seed/inspiration-catalog.json /opt/istudio/inspiration/catalog.json
COPY server/storage/uploads/inspiration/ /opt/istudio/inspiration/images/
COPY LICENSE /opt/istudio/licenses/istudio-LICENSE
COPY server/seed/awesome-gpt-image-2/LICENSE /opt/istudio/licenses/awesome-gpt-image-2-LICENSE
COPY server/seed/awesome-gpt-image-2/README.md /opt/istudio/licenses/awesome-gpt-image-2-README.md
COPY server/seed/evolink/LICENSE /opt/istudio/licenses/evolink-LICENSE
COPY server/seed/handraw/LICENSE /opt/istudio/licenses/handraw-LICENSE
COPY server/seed/evolink/README.md /opt/istudio/licenses/evolink-README.md
COPY server/seed/handraw/README.md /opt/istudio/licenses/handraw-README.md
COPY docker/Caddyfile.image /etc/caddy/Caddyfile
COPY docker/image-entrypoint.mjs docker/image-healthcheck.mjs /opt/istudio/
COPY compose.yml /opt/istudio/compose.yml
EXPOSE 8080
VOLUME ["/data/uploads"]
HEALTHCHECK --interval=10s --timeout=5s --start-period=90s --retries=12 \
    CMD ["node", "/opt/istudio/image-healthcheck.mjs"]
ENTRYPOINT ["node", "/opt/istudio/image-entrypoint.mjs"]
