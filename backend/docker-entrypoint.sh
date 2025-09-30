#!/bin/sh
set -e

echo "🔧 Starte Migration (idempotent)..."
node db/migrate.js

echo "✅ Migration abgeschlossen. Starte Anwendung..."
exec "$@"
