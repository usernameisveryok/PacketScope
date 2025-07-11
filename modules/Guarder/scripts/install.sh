#!/bin/bash

# Exit on error
set -e

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo "Please run as root"
  exit 1
fi

# Install dependencies
echo "Installing dependencies..."
apt update
apt install -y clang llvm golang-go make git libelf-dev libbpf-dev

# Set up Go environment if needed
if ! command -v go &> /dev/null; then
  echo "Go not found in PATH, setting up environment..."
  export PATH=$PATH:/usr/local/go/bin
  export GOPATH=$HOME/go
  export PATH=$PATH:$GOPATH/bin
fi

# Build the connection tracker
echo "Building connection tracker..."
cd "$(dirname "$0")/.."
make deps
make build

echo "Installation complete!"
echo "Run the connection tracker with: sudo ./conn-tracker -iface <interface_name>" 