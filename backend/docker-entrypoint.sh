#!/bin/sh
set -e

echo "🔧 Überprüfe Datenbankschema..."
node db/ensure.js

echo "✅ Schema-Abgleich abgeschlossen. Starte Anwendung..."
exec "$@"
