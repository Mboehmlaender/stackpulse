#!/bin/bash
set -e

# =====================================
# StackPulse Dev-Skript – Hauptmenü & Aktionen
# =====================================

show_menu() {
  cat <<'MENU'
Bitte wähle eine Aktion:

  1) Neues Feature anlegen
  2) Feature-Branch in dev mergen
  3) dev in master mergen
  4) Änderungen committen & pushen
  5) Docker-Release bauen & pushen
  6) Dev-Umgebung starten
  7) Git-Stashes verwalten
  8) Branch wechseln
  0) Beenden
MENU
}

pause_for_menu() {
  echo ""
  read -rp "Zurück zum Hauptmenü mit Enter... " _
}

create_new_feature() {
  local master_branch="master"
  local feature_name feature_branch base_commit

  read -rp "Bitte den Namen des neuen Features eingeben: " feature_name
  if [[ -z "$feature_name" ]]; then
    echo "❌ Fehler: Kein Feature-Name angegeben."
    return 1
  fi

  if [[ "$feature_name" =~ [^a-zA-Z0-9._-] ]]; then
    echo "❌ Fehler: Ungültiger Branch-Name. Erlaubt sind Buchstaben, Zahlen, Punkt, Unterstrich oder Bindestrich."
    return 1
  fi

  feature_branch="feature/$feature_name"

  if ! git diff-index --quiet HEAD --; then
    echo "⚠️ Es gibt noch uncommittete Änderungen. Bitte committen oder stashen, bevor ein neuer Branch erstellt wird."
    return 1
  fi

  if git show-ref --verify --quiet "refs/heads/$feature_branch"; then
    echo "❌ Fehler: Der Branch '$feature_branch' existiert lokal bereits."
    return 1
  fi

  if git ls-remote --heads origin "$feature_branch" | grep -q "$feature_branch"; then
    echo "❌ Fehler: Der Branch '$feature_branch' existiert bereits auf Remote."
    return 1
  fi

  git checkout "$master_branch"
  git pull origin "$master_branch"

  git checkout -b "$feature_branch" "$master_branch"
  git push -u origin "$feature_branch"

  base_commit=$(git rev-parse --short HEAD)

  echo "✅ Neuer Feature-Branch '$feature_branch' wurde erstellt und auf Remote gepusht."
  echo "   Basis: $master_branch@$base_commit"
}

merge_feature_into_dev() {
  local dev_branch="dev"
  local feature_branch
  local -a branch_array
  local choice index=1

  echo "Verfügbare Feature-Branches:"
  mapfile -t branch_array < <(git for-each-ref --format='%(refname:lstrip=2)' 'refs/remotes/origin/feature/*') || true

  if [[ ${#branch_array[@]} -eq 0 ]]; then
    echo "Keine Feature-Branches gefunden."
    return 0
  fi

  for feature_branch in "${branch_array[@]}"; do
    echo "  $index) $feature_branch"
    ((index++))
  done

  read -rp "Bitte Nummer wählen: " choice
  if ! [[ "$choice" =~ ^[0-9]+$ ]] || (( choice < 1 || choice > ${#branch_array[@]} )); then
    echo "Ungültige Auswahl."
    return 1
  fi

  feature_branch=${branch_array[choice-1]}
  echo "Ausgewählter Feature-Branch: $feature_branch"

  git checkout "$dev_branch"
  git pull origin "$dev_branch"

  git checkout "$feature_branch"
  git pull origin "$feature_branch"

  git checkout "$dev_branch"
  git merge --no-ff "$feature_branch" -m "Merge $feature_branch into $dev_branch"

  git push origin "$dev_branch"
  echo "Feature $feature_branch wurde erfolgreich in $dev_branch gemerged."
}

merge_dev_into_master() {
  local dev_branch="dev"
  local master_branch="master"

  git checkout "$master_branch"
  git pull origin "$master_branch"

  git checkout "$dev_branch"
  git pull origin "$dev_branch"

  git checkout "$master_branch"
  git merge --no-ff "$dev_branch" -m "Merge $dev_branch into $master_branch"

  git push origin "$master_branch"
  echo "Branch $dev_branch wurde in $master_branch gemerged."
}

push_changes() {
  local branch commit_msg version_tag confirm

  branch=$(git rev-parse --abbrev-ref HEAD)
  read -rp "Aktueller Branch: $branch. Ist das korrekt? (y/n): " confirm
  if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
    echo "Abgebrochen."
    return 1
  fi

  read -rp "Bitte Commit-Nachricht eingeben (default: 'Update'): " commit_msg
  commit_msg=${commit_msg:-Update}

  echo "Änderungen werden gestaged..."
  git add .
  echo "Commit wird erstellt..."
  git commit -m "$commit_msg" || echo "Nichts zu committen"

  if [[ "$branch" == "master" ]]; then
    while true; do
      read -rp "Bitte Versionsnummer für Master-Release Tag eingeben (z.B. v0.2.0): " version_tag
      if [[ -n "$version_tag" ]]; then
        break
      fi
      echo "Versionsnummer darf nicht leer sein."
    done
  fi

  echo "Push nach origin/$branch..."
  git push origin "$branch"

  if [[ "$branch" == "master" ]]; then
    git tag -a "$version_tag" -m "Release $version_tag"
    git push origin "$version_tag"
    echo "Tag $version_tag gesetzt und gepusht."
  fi

  echo "Push abgeschlossen."
}

docker_release() {
  local ghcr_username="mboehmlaender"
  local repo_name="stackpulse"
  local branch version_tag

  branch=$(git rev-parse --abbrev-ref HEAD)
  if [[ "$branch" != "master" ]]; then
    echo "Fehler: Du musst auf 'master' sein, um ein Release zu machen."
    return 1
  fi

  while true; do
    read -rp "Bitte Versionsnummer für das Docker-Image eingeben (z.B. v0.1): " version_tag
    if [[ -n "$version_tag" ]]; then
      break
    fi
    echo "Versionsnummer darf nicht leer sein."
  done

  if [[ -z "$CR_PAT" ]]; then
    echo "CR_PAT (GitHub Token) nicht gesetzt! Bitte export CR_PAT=<token>"
    return 1
  fi

  echo "$CR_PAT" | docker login ghcr.io -u "$ghcr_username" --password-stdin
  docker build -t "ghcr.io/$ghcr_username/$repo_name:$version_tag" .
  docker tag "ghcr.io/$ghcr_username/$repo_name:$version_tag" "ghcr.io/$ghcr_username/$repo_name:latest"

  docker push "ghcr.io/$ghcr_username/$repo_name:$version_tag"
  docker push "ghcr.io/$ghcr_username/$repo_name:latest"

  echo "Docker-Release $version_tag erfolgreich gebaut und zu GHCR gepusht!"
}

start_dev_environment() {
  local back_pid front_pid

  echo "🚀 Starte StackPulse Dev-Umgebung..."

  pushd backend >/dev/null
  npm install
  npm start &
  back_pid=$!
  popd >/dev/null

  pushd frontend >/dev/null
  npm install
  npm run dev &
  front_pid=$!
  npm run build
  popd >/dev/null

  echo ""
  echo "✅ StackPulse läuft lokal:"
  echo "Frontend (Vite Dev): http://localhost:5173"
  echo "Backend API:      http://localhost:4001"
  echo "Beenden mit STRG+C"

  wait "$back_pid" "$front_pid"
}

manage_stash() {
  local current_branch action user_input stash_name choice selected_stash
  local -A stash_map
  local -a stash_list
  local i line stash_ref stash_msg

  current_branch=$(git rev-parse --abbrev-ref HEAD)

  echo "Aktueller Branch: $current_branch"
  echo "Was möchtest du tun?"
  echo "1) Neuen Stash anlegen"
  echo "2) Vorhandenen Stash laden (apply)"
  echo "3) Vorhandenen Stash löschen"
  echo "4) Stash anwenden und löschen (pop)"
  read -rp "Auswahl: " action

  case $action in
    1)
      read -rp "Gib einen Namen für den Stash ein: " user_input
      stash_name="$current_branch - $user_input"

      if git stash list | grep -q "$stash_name"; then
        while IFS= read -r line; do
          stash_ref=$(echo "$line" | awk -F: '{print $1}')
          echo "Lösche vorhandenen Stash: $stash_ref"
          git stash drop "$stash_ref"
        done < <(git stash list | grep "$stash_name")
      fi

      git stash push -u -m "$stash_name"
      echo "Stash '$stash_name' wurde angelegt."
      ;;

    2|3|4)
      local action_text
      case $action in
        2) action_text="laden" ;;
        3) action_text="löschen" ;;
        4) action_text="anwenden & löschen" ;;
      esac

      echo "Liste aller Stashes für Branch '$current_branch':"
      mapfile -t stash_list < <(git stash list | grep "$current_branch") || true

      if [[ ${#stash_list[@]} -eq 0 ]]; then
        echo "Keine Stashes für diesen Branch vorhanden."
        return 0
      fi

      i=1
      for line in "${stash_list[@]}"; do
        stash_ref=$(echo "$line" | awk -F: '{print $1}')
        stash_msg=$(echo "$line" | cut -d':' -f3- | sed 's/^ //')
        echo "  $i) $stash_ref -> $stash_msg"
        stash_map[$i]=$stash_ref
        ((i++))
      done

      read -rp "Wähle einen Stash zum ${action_text} (Nummer): " choice
      if [[ -z "${stash_map[$choice]}" ]]; then
        echo "Ungültige Auswahl!"
        return 1
      fi

      selected_stash=${stash_map[$choice]}

      case $action in
        2)
          echo "Wende Stash an: $selected_stash"
          git stash apply "$selected_stash"
          ;;
        3)
          echo "Lösche Stash: $selected_stash"
          git stash drop "$selected_stash"
          ;;
        4)
          echo "Wende Stash an und lösche ihn: $selected_stash"
          git stash pop "$selected_stash"
          ;;
      esac
      ;;

    *)
      echo "Ungültige Auswahl!"
      return 1
      ;;
  esac
}

switch_branch() {
  local -a unversioned_files=("scripts/dev-script.sh")
  local file
  local local_branches remote_branches all_branches master_branch dev_branch feature_branches
  local -a sorted_branches
  local i=1 choice selected_branch
  declare -A branch_map

  for file in "${unversioned_files[@]}"; do
    if [[ -f "$file" ]]; then
      mkdir -p /tmp/git_safe_backup
      cp "$file" "/tmp/git_safe_backup/$(basename "$file")"
    fi
  done

  local_branches=$(git branch | sed 's/* //' | sed 's/^[[:space:]]*//')
  remote_branches=$(git branch -r | grep -v 'HEAD' | sed 's|^[[:space:]]*origin/||' | sed 's/^[[:space:]]*//')
  all_branches=$(printf "%s\n%s\n" "$local_branches" "$remote_branches" | sort -u)

  master_branch=$(echo "$all_branches" | grep -x 'master' || true)
  dev_branch=$(echo "$all_branches" | grep -x 'dev' || true)
  feature_branches=$(echo "$all_branches" | grep '^feature/' | sort || true)

  [[ -n "$master_branch" ]] && sorted_branches+=("$master_branch")
  [[ -n "$dev_branch" ]] && sorted_branches+=("$dev_branch")
  if [[ -n "$feature_branches" ]]; then
    while IFS= read -r line; do
      [[ -n "$line" ]] && sorted_branches+=("$line")
    done <<< "$feature_branches"
  fi

  if [[ ${#sorted_branches[@]} -eq 0 ]]; then
    echo "Keine Branches gefunden."
    return 1
  fi

  echo "Verfügbare Branches:"
  for line in "${sorted_branches[@]}"; do
    echo "  $i) $line"
    branch_map[$i]=$line
    ((i++))
  done

  read -rp "Wähle einen Branch (Nummer): " choice
  if [[ -z "${branch_map[$choice]}" ]]; then
    echo "Ungültige Auswahl!"
    return 1
  fi

  selected_branch=${branch_map[$choice]}
  echo "Wechsle zu Branch: $selected_branch"

  git fetch origin

  if git show-ref --verify --quiet "refs/heads/$selected_branch"; then
    git checkout "$selected_branch"
  else
    git checkout -b "$selected_branch" "origin/$selected_branch"
  fi

  git reset --hard "origin/$selected_branch"
  git clean -fd

  for file in "${unversioned_files[@]}"; do
    if [[ -f "/tmp/git_safe_backup/$(basename "$file")" ]]; then
      mkdir -p "$(dirname "$file")"
      mv "/tmp/git_safe_backup/$(basename "$file")" "$file"
    fi
  done
  rm -rf /tmp/git_safe_backup

  echo "Branch '$selected_branch' ist nun aktiv. Arbeitsverzeichnis entspricht exakt dem Remote-Stand."
  echo "Gesicherte Dateien wurden wiederhergestellt."
}

main() {
  local selection
  while true; do
    echo ""
    show_menu
    read -rp "Auswahl: " selection
    echo ""
    case $selection in
      1)
        create_new_feature
        pause_for_menu
        ;;
      2)
        merge_feature_into_dev
        pause_for_menu
        ;;
      3)
        merge_dev_into_master
        pause_for_menu
        ;;
      4)
        push_changes
        pause_for_menu
        ;;
      5)
        docker_release
        pause_for_menu
        ;;
      6)
        start_dev_environment
        pause_for_menu
        ;;
      7)
        manage_stash
        pause_for_menu
        ;;
      8)
        switch_branch
        pause_for_menu
        ;;
      0)
        echo "Auf Wiedersehen!"
        exit 0
        ;;
      *)
        echo "❌ Ungültige Auswahl."
        ;;
    esac
  done
}

main "$@"
