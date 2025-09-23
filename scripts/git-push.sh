#!/bin/bash
set -e

# Aktuellen Branch herausfinden
BRANCH=$(git rev-parse --abbrev-ref HEAD)

# Branch bestätigen
read -p "Aktueller Branch: $BRANCH. Ist das korrekt? (y/n): " CONFIRM
if [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then
  echo "Abgebrochen."
  exit 1
fi

# Commit-Nachricht
read -p "Bitte Commit-Nachricht eingeben (default: 'Update'): " COMMIT_MSG
COMMIT_MSG=${COMMIT_MSG:-Update}

# Änderungen stagen und committen
echo "Änderungen werden gestaged..."
git add .
echo "Commit wird erstellt..."
git commit -m "$COMMIT_MSG" || echo "Nichts zu committen"

# Prüfen, ob Branch master ist
if [[ "$BRANCH" == "master" ]]; then
    # Versionsnummer verpflichtend abfragen
    while true; do
        read -p "Bitte Versionsnummer für Master-Release Tag eingeben (z.B. v0.2.0): " VERSION_TAG
        if [[ -n "$VERSION_TAG" ]]; then
            break
        else
            echo "Versionsnummer darf nicht leer sein. Bitte eingeben."
        fi
    done
fi

# Push Branch
echo "Push nach origin/$BRANCH..."
git push origin "$BRANCH"

# Tag setzen und pushen, nur bei master
if [[ "$BRANCH" == "master" ]]; then
    git tag -a "$VERSION_TAG" -m "Release $VERSION_TAG"
    git push origin "$VERSION_TAG"
    echo "Tag $VERSION_TAG gesetzt und gepusht."
fi

echo "Push abgeschlossen."
