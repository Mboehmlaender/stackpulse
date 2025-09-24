#!/bin/bash

# Alle lokalen Branches holen, führende Sternchen und Leerzeichen entfernen
LOCAL_BRANCHES=$(git branch | sed 's/* //' | sed 's/^[[:space:]]*//')

# Alle Remote-Branches holen, 'origin/' entfernen, HEAD ignorieren, führende Leerzeichen entfernen
REMOTE_BRANCHES=$(git branch -r | grep -v 'HEAD' | sed 's|origin/||' | sed 's/^[[:space:]]*//')

# Beide Listen zusammenführen und Duplikate entfernen
ALL_BRANCHES=$(echo -e "$LOCAL_BRANCHES\n$REMOTE_BRANCHES" | sort -u)

# Master und dev extrahieren, restliche feature-Branches alphabetisch
MASTER_BRANCH=$(echo "$ALL_BRANCHES" | grep -x 'master')
DEV_BRANCH=$(echo "$ALL_BRANCHES" | grep -x 'dev')
FEATURE_BRANCHES=$(echo "$ALL_BRANCHES" | grep '^feature/' | sort)

# Zusammenführen
SORTED_BRANCHES=()
[[ -n "$MASTER_BRANCH" ]] && SORTED_BRANCHES+=("$MASTER_BRANCH")
[[ -n "$DEV_BRANCH" ]] && SORTED_BRANCHES+=("$DEV_BRANCH")
for branch in $FEATURE_BRANCHES; do
    SORTED_BRANCHES+=("$branch")
done

# Branches nummerieren
echo "Verfügbare Branches:"
i=1
declare -A BRANCH_MAP
for branch in "${SORTED_BRANCHES[@]}"; do
    echo "$i) $branch"
    BRANCH_MAP[$i]=$branch
    ((i++))
done

# Auswahl abfragen
read -p "Wähle einen Branch (Nummer): " choice

# Validierung
if [[ -z "${BRANCH_MAP[$choice]}" ]]; then
    echo "Ungültige Auswahl!"
    exit 1
fi

SELECTED_BRANCH=${BRANCH_MAP[$choice]}
echo "Wechsle zu Branch: $SELECTED_BRANCH"

# Remote-Stand holen
git fetch origin

# Branch wechseln (lokal erstellen, falls nur remote vorhanden)
if git show-ref --verify --quiet refs/heads/$SELECTED_BRANCH; then
    git checkout $SELECTED_BRANCH
else
    git checkout -b $SELECTED_BRANCH origin/$SELECTED_BRANCH
fi

# Arbeitsverzeichnis exakt auf Remote-Branch zurücksetzen
git reset --hard origin/$SELECTED_BRANCH
git clean -fd

echo "Branch '$SELECTED_BRANCH' ist nun aktiv. Arbeitsverzeichnis entspricht exakt dem Remote-Stand."
