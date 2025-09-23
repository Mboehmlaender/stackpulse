#!/bin/bash
# Skript: Feature in Dev mergen mit Auswahl der Feature-Branches

DEV_BRANCH="dev"

# Auflisten aller Feature-Branches (lokal und remote)
echo "Verfügbare Feature-Branches:"
FEATURE_BRANCHES=$(git branch -r | grep 'origin/feature/' | sed 's|origin/||')
PS3="Bitte wähle einen Feature-Branch zum Mergen: "

# in ein Array konvertieren
BRANCH_ARRAY=($FEATURE_BRANCHES)

# Auswahlmenü anzeigen
select CHOSEN_BRANCH in "${BRANCH_ARRAY[@]}"; do
  if [[ -n "$CHOSEN_BRANCH" ]]; then
    FEATURE_BRANCH=$CHOSEN_BRANCH
    break
  else
    echo "Ungültige Auswahl. Bitte erneut versuchen."
  fi
done

echo "Ausgewählter Feature-Branch: $FEATURE_BRANCH"

# Dev aktuell holen
git checkout $DEV_BRANCH
git pull origin $DEV_BRANCH

# Feature-Branch aktuell holen
git checkout $FEATURE_BRANCH
git pull origin $FEATURE_BRANCH

# Merge Feature in Dev
git checkout $DEV_BRANCH
git merge --no-ff $FEATURE_BRANCH -m "Merge $FEATURE_BRANCH into $DEV_BRANCH"

# Push Dev auf Remote
git push origin $DEV_BRANCH

echo "Feature $FEATURE_BRANCH wurde erfolgreich in $DEV_BRANCH gemerged."
