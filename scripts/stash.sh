#!/bin/bash

# ===============================
# Git Stash Manager mit Branch-Filter und Überschreiben
# ===============================

# Aktuellen Branch ermitteln
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)

echo "Aktueller Branch: $CURRENT_BRANCH"
echo "Was möchtest du tun?"
echo "1) Neuen Stash anlegen"
echo "2) Vorhandenen Stash laden (apply)"
echo "3) Vorhandenen Stash löschen"
echo "4) Stash anwenden und löschen (pop)"
read -p "Auswahl: " action

case $action in
  1)
    # ========== Neuen Stash anlegen ==========
    read -p "Gib einen Namen für den Stash ein: " USER_INPUT
    STASH_NAME="$CURRENT_BRANCH - $USER_INPUT"

    # Prüfen, ob Stash-Name schon existiert
    EXISTING=$(git stash list | grep "$STASH_NAME")
    if [[ -n "$EXISTING" ]]; then
      echo "Ein Stash mit dem Namen '$STASH_NAME' existiert bereits."
      # Alle passenden Stashes löschen
      while IFS= read -r line; do
        STASH_REF=$(echo "$line" | awk -F: '{print $1}')
        echo "Lösche vorhandenen Stash: $STASH_REF"
        git stash drop "$STASH_REF"
      done <<< "$EXISTING"
    fi

    # Neuen Stash anlegen (inkl. untracked Dateien)
    git stash push -u -m "$STASH_NAME"
    echo "Stash '$STASH_NAME' wurde angelegt."
    ;;

  2)
    # ========== Stash anwenden ==========
    echo "Liste aller Stashes für Branch '$CURRENT_BRANCH':"
    STASHES=$(git stash list | grep "$CURRENT_BRANCH")

    if [[ -z "$STASHES" ]]; then
      echo "Keine Stashes für diesen Branch vorhanden."
      exit 0
    fi

    i=1
    declare -A STASH_MAP
    while IFS= read -r line; do
      STASH_REF=$(echo "$line" | awk -F: '{print $1}')
      STASH_MSG=$(echo "$line" | cut -d':' -f3- | sed 's/^ //')
      echo "$i) $STASH_REF -> $STASH_MSG"
      STASH_MAP[$i]=$STASH_REF
      ((i++))
    done <<< "$STASHES"

    read -p "Wähle einen Stash (Nummer): " choice
    if [[ -z "${STASH_MAP[$choice]}" ]]; then
      echo "Ungültige Auswahl!"
      exit 1
    fi

    SELECTED_STASH=${STASH_MAP[$choice]}
    echo "Wende Stash an: $SELECTED_STASH"
    git stash apply "$SELECTED_STASH"
    ;;

  3)
    # ========== Stash löschen ==========
    echo "Liste aller Stashes für Branch '$CURRENT_BRANCH':"
    STASHES=$(git stash list | grep "$CURRENT_BRANCH")

    if [[ -z "$STASHES" ]]; then
      echo "Keine Stashes für diesen Branch vorhanden."
      exit 0
    fi

    i=1
    declare -A STASH_MAP
    while IFS= read -r line; do
      STASH_REF=$(echo "$line" | awk -F: '{print $1}')
      STASH_MSG=$(echo "$line" | cut -d':' -f3- | sed 's/^ //')
      echo "$i) $STASH_REF -> $STASH_MSG"
      STASH_MAP[$i]=$STASH_REF
      ((i++))
    done <<< "$STASHES"

    read -p "Wähle einen Stash zum Löschen (Nummer): " choice
    if [[ -z "${STASH_MAP[$choice]}" ]]; then
      echo "Ungültige Auswahl!"
      exit 1
    fi

    SELECTED_STASH=${STASH_MAP[$choice]}
    echo "Lösche Stash: $SELECTED_STASH"
    git stash drop "$SELECTED_STASH"
    ;;

  4)
    # ========== Stash anwenden und löschen (pop) ==========
    echo "Liste aller Stashes für Branch '$CURRENT_BRANCH':"
    STASHES=$(git stash list | grep "$CURRENT_BRANCH")

    if [[ -z "$STASHES" ]]; then
      echo "Keine Stashes für diesen Branch vorhanden."
      exit 0
    fi

    i=1
    declare -A STASH_MAP
    while IFS= read -r line; do
      STASH_REF=$(echo "$line" | awk -F: '{print $1}')
      STASH_MSG=$(echo "$line" | cut -d':' -f3- | sed 's/^ //')
      echo "$i) $STASH_REF -> $STASH_MSG"
      STASH_MAP[$i]=$STASH_REF
      ((i++))
    done <<< "$STASHES"

    read -p "Wähle einen Stash zum Anwenden & Löschen (Nummer): " choice
    if [[ -z "${STASH_MAP[$choice]}" ]]; then
      echo "Ungültige Auswahl!"
      exit 1
    fi

    SELECTED_STASH=${STASH_MAP[$choice]}
    echo "Wende Stash an und lösche ihn: $SELECTED_STASH"
    git stash pop "$SELECTED_STASH"
    ;;

  *)
    echo "Ungültige Auswahl!"
    exit 1
    ;;
esac