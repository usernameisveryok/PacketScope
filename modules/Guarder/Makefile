.PHONY: all build clean generate

# Variables
BINARY_NAME=conn-tracker
CLANG ?= clang
CFLAGS := -O2 -g -Wall -Werror
GO ?= go

all: build

# Generate Go code from eBPF C code
generate:
	cd cmd/conn-tracker && $(GO) generate

# Build the Go binary
build: generate
	$(GO) build -o $(BINARY_NAME) ./cmd/conn-tracker

# Clean build artifacts
clean:
	rm -f $(BINARY_NAME)
	rm -f cmd/conn-tracker/conntracker_bpf*.go
	rm -f cmd/conn-tracker/conntracker_bpf*.o

# Install dependencies
deps:
	$(GO) mod tidy
	$(GO) get github.com/cilium/ebpf
	$(GO) get github.com/cilium/ebpf/cmd/bpf2go

# Run the program (requires root privileges)
run: build
	sudo ./$(BINARY_NAME) -iface $(IFACE)

# Create directories for pkg
setup:
	mkdir -p pkg/bpf 