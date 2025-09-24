#!/bin/bash
set -e

# --- Konfiguration ---
GHCR_USERNAME="<dein-github-username>"
REPO_NAME="<dein-repo-name>"

# --- Branch prüfen ---
BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [[ "$BRANCH" != "master" ]]; then
    echo "Fehler: Du musst auf 'master' sein, um ein Release zu machen."
    exit 1
fi

# --- Versionsnummer abfragen ---
while true; do
    read -p "Bitte Versionsnummer für das Release eingeben (z.B. v0.2.0): " VERSION_TAG
    if [[ -n "$VERSION_TAG" ]]; then break; else echo "Versionsnummer darf nicht leer sein."; fi
done

# --- Git: Pull und Merge sicherstellen ---
git pull origin master

# --- Git: Commit ausstehender Änderungen ---
git add .
read -p "Commit-Nachricht eingeben (default: 'Release $VERSION_TAG'): " COMMIT_MSG
COMMIT_MSG=${COMMIT_MSG:-"Release $VERSION_TAG"}
git commit -m "$COMMIT_MSG" || echo "Keine Änderungen zum Committen."

# --- Git: Tag setzen ---
if git rev-parse "$VERSION_TAG" >/dev/null 2>&1; then
    echo "Tag $VERSION_TAG existiert bereits. Bitte zuerst löschen oder neuen Tag wählen."
    exit 1
fi

git tag -a "$VERSION_TAG" -m "Release $VERSION_TAG"

# --- Git: Push master + Tag ---
git push origin master
git push origin "$VERSION_TAG"
echo "Tag $VERSION_TAG gesetzt und auf master gepusht."

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

echo "Release $VERSION_TAG erfolgreich auf master + GHCR gepusht!"
