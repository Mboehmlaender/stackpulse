#!/bin/bash
# Skript: Dev in Master mergen

DEV_BRANCH="dev"
MASTER_BRANCH="master"

# Auf master wechseln und aktuell holen
git checkout $MASTER_BRANCH
git pull origin $MASTER_BRANCH

# Dev aktuell holen
git checkout $DEV_BRANCH
git pull origin $DEV_BRANCH

# Merge Dev in Master
git checkout $MASTER_BRANCH
git merge --no-ff $DEV_BRANCH -m "Merge $DEV_BRANCH into $MASTER_BRANCH"

# Push Master auf Remote
git push origin $MASTER_BRANCH

echo "Branch $DEV_BRANCH wurde in $MASTER_BRANCH gemerged."