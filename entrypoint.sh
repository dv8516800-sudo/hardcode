#!/bin/sh
set -e

# Start Lightpanda and bind to 0.0.0.0 to allow access via Docker port mapping.
# Internal port is 9222 as requested.
exec /usr/local/bin/lightpanda serve --host 0.0.0.0 --port 9222 --log-level info
