#!/bin/sh
set -eu
mkdir -p /opt/data
chown node:node /opt/data
chmod 700 /opt/data
exec su-exec node "$@"
