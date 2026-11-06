#!/bin/sh
set -eu
umask 077

# The runner's image availability probe replaces CMD with sh -c 'exit 0'.
if [ "${1:-}" = "sh" ]; then
    exec "$@"
fi

cd /app/integration
export TEST_SCRIPT="${TEST_SCRIPT:-${1:-tests:gui}}"
export OUTPUT_DIR="${OUTPUT_DIR:-/e2e-results}"
if [ -n "${TLS_CA_CERT_PATH:-}" ]; then
    export NODE_EXTRA_CA_CERTS="$TLS_CA_CERT_PATH"
fi

# Loaders read files directly; never copy secrets into the image workspace.
mkdir -p "$OUTPUT_DIR"
exec npm run "$TEST_SCRIPT"
