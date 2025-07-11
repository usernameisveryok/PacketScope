#!/bin/bash

# Exit on error
set -e

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo "Please run as root"
  exit 1
fi

# Default values
INTERFACE=""
INTERVAL=5

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    -i|--interface)
      INTERFACE="$2"
      shift 2
      ;;
    -t|--interval)
      INTERVAL="$2"
      shift 2
      ;;
    -h|--help)
      echo "Usage: $0 -i|--interface <interface_name> [-t|--interval <seconds>]"
      echo "  -i, --interface  Network interface to attach XDP program to"
      echo "  -t, --interval   Polling interval in seconds (default: 5)"
      echo "  -h, --help       Show this help message"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      echo "Use -h or --help for usage information"
      exit 1
      ;;
  esac
done

# Check if interface is provided
if [ -z "$INTERFACE" ]; then
  echo "Error: Interface not specified"
  echo "Usage: $0 -i|--interface <interface_name> [-t|--interval <seconds>]"
  exit 1
fi

# Check if interface exists
if ! ip link show "$INTERFACE" &> /dev/null; then
  echo "Error: Interface $INTERFACE does not exist"
  exit 1
fi

# Change to the project directory
cd "$(dirname "$0")/.."

# Build if the binary doesn't exist
if [ ! -f "./conn-tracker" ]; then
  echo "Building connection tracker..."
  make build
fi

# Run the connection tracker
echo "Starting connection tracker on interface $INTERFACE with interval $INTERVAL seconds..."
./conn-tracker -iface "$INTERFACE" -interval "$INTERVAL" 