#!/bin/bash
# Skript: Neues Feature erstellen

MASTER_BRANCH="master"

# Abfrage Feature-Name
read -p "Bitte den Namen des neuen Features eingeben: " FEATURE_NAME

# Falls nichts eingegeben wurde, Skript abbrechen
if [ -z "$FEATURE_NAME" ]; then
  echo "❌ Fehler: Kein Feature-Name angegeben."
  exit 1
fi

# Validierung: nur erlaubte Zeichen
if [[ "$FEATURE_NAME" =~ [^a-zA-Z0-9._-] ]]; then
  echo "❌ Fehler: Ungültiger Branch-Name. Bitte nur Buchstaben, Zahlen, Punkt, Unterstrich oder Bindestrich verwenden."
  exit 1
fi

FEATURE_BRANCH="feature/$FEATURE_NAME"

# Check auf uncommittete Änderungen
if ! git diff-index --quiet HEAD --; then
  echo "⚠️ Es gibt noch uncommittete Änderungen. Bitte committen oder stashen, bevor ein neuer Branch erstellt wird."
  exit 1
fi

# Prüfen, ob Branch lokal schon existiert
if git show-ref --verify --quiet refs/heads/$FEATURE_BRANCH; then
  echo "❌ Fehler: Der Branch '$FEATURE_BRANCH' existiert lokal bereits."
  exit 1
fi

# Prüfen, ob Branch remote schon existiert
if git ls-remote --heads origin $FEATURE_BRANCH | grep -q $FEATURE_BRANCH; then
  echo "❌ Fehler: Der Branch '$FEATURE_BRANCH' existiert bereits auf Remote."
  exit 1
fi

# Auf master wechseln und aktualisieren
git checkout $MASTER_BRANCH
git pull origin $MASTER_BRANCH

# Neuen Feature-Branch erstellen und auschecken
git checkout -b $FEATURE_BRANCH $MASTER_BRANCH

# Branch auf Remote pushen
git push -u origin $FEATURE_BRANCH

# Commit-Hash der Basis holen
BASE_COMMIT=$(git rev-parse --short HEAD)

echo "✅ Neuer Feature-Branch '$FEATURE_BRANCH' wurde erstellt und auf Remote gepusht."
echo "   Basis: $MASTER_BRANCH@$BASE_COMMIT"
