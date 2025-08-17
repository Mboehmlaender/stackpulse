#!/bin/bash
# Skript: Branch auswählen und wechseln

# Alle Branches abrufen (lokal + remote)
git fetch --all --prune

# Lokale Branches
LOCAL_BRANCHES=$(git branch | sed 's/* //')
# Remote Branches (ohne origin/HEAD)
REMOTE_BRANCHES=$(git branch -r | grep -v 'HEAD' | sed 's|origin/||')

# Alle Branches zusammenführen und Duplikate entfernen
ALL_BRANCHES=$(echo -e "$LOCAL_BRANCHES\n$REMOTE_BRANCHES" | sort -u)

# Array erstellen
BRANCH_ARRAY=($ALL_BRANCHES)

echo "Verfügbare Branches:"
PS3="Bitte wähle einen Branch zum Wechseln: "

# Auswahlmenü
select CHOSEN_BRANCH in "${BRANCH_ARRAY[@]}"; do
  if [[ -n "$CHOSEN_BRANCH" ]]; then
    echo "Wechsle zu Branch: $CHOSEN_BRANCH"
    # Prüfen, ob lokaler Branch existiert
    if git show-ref --verify --quiet refs/heads/$CHOSEN_BRANCH; then
      git checkout $CHOSEN_BRANCH
    else
      # Remote-Branch auschecken
      git checkout -b $CHOSEN_BRANCH origin/$CHOSEN_BRANCH
    fi
    break
  else
    echo "Ungültige Auswahl. Bitte erneut versuchen."
  fi
done
