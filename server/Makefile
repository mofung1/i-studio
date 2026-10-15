.PHONY: run build fmt fmt-check vet test test-race check clean

BINARY ?= bin/istudio-server

run:
	go run ./cmd/server

build:
	go build -trimpath -o $(BINARY) ./cmd/server

fmt:
	gofmt -w cmd internal

fmt-check:
	@test -z "$$(gofmt -l cmd internal)" || { gofmt -l cmd internal; exit 1; }

vet:
	go vet ./...

test:
	go test ./...

test-race:
	go test -race ./...

check: fmt-check vet test-race

clean:
	rm -f $(BINARY)
