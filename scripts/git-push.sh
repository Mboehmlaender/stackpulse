#!/bin/bash
set -e

# Aktuellen Branch herausfinden
BRANCH=$(git rev-parse --abbrev-ref HEAD)

# Branch bestätigen
read -p "📂 Aktueller Branch: $BRANCH. Ist das korrekt? (y/n): " CONFIRM
if [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then
  echo "❌ Abgebrochen."
  exit 1
fi

# Interaktive Eingabe der Commit-Nachricht
read -p "📝 Bitte Commit-Nachricht eingeben (default: 'Update'): " COMMIT_MSG

# Wenn leer, default setzen
if [ -z "$COMMIT_MSG" ]; then
  COMMIT_MSG="Update"
fi

echo "➕ Änderungen werden gestaged..."
git add .

echo "📝 Commit wird erstellt..."
git commit -m "$COMMIT_MSG" || echo "⚠️ Nichts zu committen"

echo "🚀 Push nach origin/$BRANCH..."
git push origin "$BRANCH"

echo "✅ Push abgeschlossen!"
