FROM node:22-bookworm-slim AS build

WORKDIR /app
RUN corepack enable
COPY web/package.json web/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY web ./
ARG NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:44000
ARG NEXT_PUBLIC_SITE_URL=
ARG SITE_ENV=development
ARG NEXT_IMAGE_UNOPTIMIZED=0
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL SITE_ENV=$SITE_ENV NEXT_STANDALONE=1 \
    NEXT_IMAGE_UNOPTIMIZED=$NEXT_IMAGE_UNOPTIMIZED
RUN pnpm build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
