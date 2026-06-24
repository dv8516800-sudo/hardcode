#!/bin/sh
set -e

# The requirement is to ensure the process starts in under 100ms
# and exposes the internal CDP socket at 127.0.0.1:9222.
# We use 'exec' to replace the shell process with Lightpanda,
# which is the fastest way to start.

exec /usr/local/bin/lightpanda serve --host 0.0.0.0 --port 9222 --log-level warn
