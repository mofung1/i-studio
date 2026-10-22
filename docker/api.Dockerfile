FROM golang:1.27.3-alpine AS build

WORKDIR /src
COPY server/go.mod server/go.sum ./server/
WORKDIR /src/server
RUN go mod download
COPY server/ ./
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags='-s -w' -o /out/istudio-server ./cmd/server

FROM alpine:3.22
RUN apk add --no-cache ca-certificates wget
COPY --from=build /out/istudio-server /usr/local/bin/istudio-server
ENV API_HOST=0.0.0.0 API_PORT=4000 STORAGE_ROOT=/data/uploads
EXPOSE 4000
VOLUME ["/data/uploads"]
ENTRYPOINT ["/usr/local/bin/istudio-server"]
