#!/bin/bash

# ===============================
# Git Stash Manager Script
# ===============================

# Aktuellen Branch ermitteln
CURRENT_BRANCH=$(git branch --show-current)

echo "Was möchtest du tun?"
echo "1) Neuen Stash anlegen (aktueller Branch: $CURRENT_BRANCH)"
echo "2) Vorhandenen Stash anwenden (nur aktueller Branch)"
echo "3) Vorhandenen Stash löschen (nur aktueller Branch)"

read -p "Wähle eine Option (1-3): " ACTION

case "$ACTION" in
    1)
        # Neuer Stash (inkl. untracked Dateien)
        read -p "Gib einen eigenen Namen für den Stash ein: " CUSTOM_NAME
        if [[ -z "$CUSTOM_NAME" ]]; then
            CUSTOM_NAME="WIP-$(date +%Y%m%d%H%M%S)"
        fi

        STASH_NAME="${CURRENT_BRANCH} - ${CUSTOM_NAME}"
        git stash push -u -m "$STASH_NAME"
        echo "Änderungen erfolgreich gestasht unter dem Namen: '$STASH_NAME'"
        git stash list | grep "On $CURRENT_BRANCH"
        ;;
    2)
        # Stash anwenden
        echo "Liste aller Stashes für Branch '$CURRENT_BRANCH':"
        BRANCH_STASHES=($(git stash list | grep "On $CURRENT_BRANCH"))

        if [[ ${#BRANCH_STASHES[@]} -eq 0 ]]; then
            echo "Keine Stashes für diesen Branch vorhanden."
            exit 0
        fi

        i=1
        declare -A STASH_MAP
        while read -r line; do
            STASH_ID=$(echo "$line" | cut -d: -f1)
            STASH_MSG=$(echo "$line" | cut -d: -f3- | sed 's/^ //')
            echo "$i) $STASH_ID -> $STASH_MSG"
            STASH_MAP[$i]=$STASH_ID
            ((i++))
        done < <(git stash list | grep "On $CURRENT_BRANCH")

        read -p "Gib die Nummer des Stashs ein, den du anwenden möchtest: " STASH_CHOICE
        if [[ -z "${STASH_MAP[$STASH_CHOICE]}" ]]; then
            echo "Ungültige Auswahl!"
            exit 1
        fi

        git stash apply ${STASH_MAP[$STASH_CHOICE]}
        echo "Stash ${STASH_MAP[$STASH_CHOICE]} angewendet."
        ;;
    3)
        # Stash löschen
        echo "Liste aller Stashes für Branch '$CURRENT_BRANCH':"
        i=1
        declare -A STASH_MAP
        while read -r line; do
            STASH_ID=$(echo "$line" | cut -d: -f1)
            STASH_MSG=$(echo "$line" | cut -d: -f3- | sed 's/^ //')
            echo "$i) $STASH_ID -> $STASH_MSG"
            STASH_MAP[$i]=$STASH_ID
            ((i++))
        done < <(git stash list | grep "On $CURRENT_BRANCH")

        if [[ $i -eq 1 ]]; then
            echo "Keine Stashes für diesen Branch vorhanden."
            exit 0
        fi

        read -p "Gib die Nummer des Stashs ein, den du löschen möchtest: " STASH_CHOICE
        if [[ -z "${STASH_MAP[$STASH_CHOICE]}" ]]; then
            echo "Ungültige Auswahl!"
            exit 1
        fi

        git stash drop ${STASH_MAP[$STASH_CHOICE]}
        echo "Stash ${STASH_MAP[$STASH_CHOICE]} gelöscht."
        ;;
    *)
        echo "Ungültige Option!"
        exit 1
        ;;
esac
