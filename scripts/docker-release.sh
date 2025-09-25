#!/bin/bash
set -e

# --- Konfiguration ---
GHCR_USERNAME="mboehmlaender"
REPO_NAME="stackpulse"

# --- Branch prüfen ---
BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [[ "$BRANCH" != "master" ]]; then
    echo "Fehler: Du musst auf 'master' sein, um ein Release zu machen."
    exit 1
fi

# --- Versionsnummer abfragen ---
while true; do
    read -p "Bitte Versionsnummer für das Docker-Image eingeben (z.B. v0.1): " VERSION_TAG
    if [[ -n "$VERSION_TAG" ]]; then break; else echo "Versionsnummer darf nicht leer sein."; fi
done

# --- Docker: Login ---
if [ -z "$CR_PAT" ]; then
    echo "CR_PAT (GitHub Token) nicht gesetzt! Bitte export CR_PAT=<token>"
    exit 1
fi
echo $CR_PAT | docker login ghcr.io -u $GHCR_USERNAME --password-stdin

# --- Docker: Build & Tag ---
docker build -t ghcr.io/$GHCR_USERNAME/$REPO_NAME:$VERSION_TAG .
docker tag ghcr.io/$GHCR_USERNAME/$REPO_NAME:$VERSION_TAG ghcr.io/$GHCR_USERNAME/$REPO_NAME:latest

# --- Docker: Push ---
docker push ghcr.io/$GHCR_USERNAME/$REPO_NAME:$VERSION_TAG
docker push ghcr.io/$GHCR_USERNAME/$REPO_NAME:latest

echo "Docker-Release $VERSION_TAG erfolgreich gebaut und zu GHCR gepusht!"
