#!/bin/bash
# Skript: Dev in Master mergen + Versions-Tag (Pflicht)

DEV_BRANCH="dev"
MASTER_BRANCH="master"

# Versionsnummer verpflichtend abfragen
while true; do
  read -p "Bitte Versionsnummer für Master Release Tag eingeben (z.B. v0.2.0): " VERSION_TAG
  if [[ -n "$VERSION_TAG" ]]; then
    break
  else
    echo "Versionsnummer darf nicht leer sein. Bitte eingeben."
  fi
done

# Auf Master wechseln und aktuell holen
git checkout $MASTER_BRANCH
git pull origin $MASTER_BRANCH

# Dev aktuell holen
git checkout $DEV_BRANCH
git pull origin $DEV_BRANCH

# Merge Dev in Master
git checkout $MASTER_BRANCH
git merge --no-ff $DEV_BRANCH -m "Merge $DEV_BRANCH into $MASTER_BRANCH"

# Tag auf Master setzen
git tag -a "$VERSION_TAG" -m "Release $VERSION_TAG"
git push origin "$MASTER_BRANCH"
git push origin "$VERSION_TAG"

echo "Branch $DEV_BRANCH wurde erfolgreich in $MASTER_BRANCH gemerged und Tag $VERSION_TAG gesetzt."
