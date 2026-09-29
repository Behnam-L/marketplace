#!/bin/sh
set -e
case "$1" in
  serve)
    node dist/database/cli/migrate.js
    node dist/database/cli/seed.js
    exec node dist/main.js
    ;;
  generate-secrets)
    exec node dist/database/cli/generate-secrets.js "${SECRETS_DIR:-/run/bajet-secrets}"
    ;;
  *)
    exec "$@"
    ;;
esac
