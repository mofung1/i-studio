FROM golang:1.25-alpine AS build

WORKDIR /src
COPY apps/server/go.mod apps/server/go.sum ./apps/server/
WORKDIR /src/apps/server
RUN go mod download
COPY apps/server/ ./
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags='-s -w' -o /out/istudio-server .

FROM alpine:3.22
RUN apk add --no-cache ca-certificates wget
COPY --from=build /out/istudio-server /usr/local/bin/istudio-server
ENV API_HOST=0.0.0.0 API_PORT=4000 STORAGE_ROOT=/data/uploads
EXPOSE 4000
VOLUME ["/data/uploads"]
ENTRYPOINT ["/usr/local/bin/istudio-server"]
