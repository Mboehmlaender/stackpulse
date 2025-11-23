# Logs-Seite

Die Logs-Seite dient der Nachvollziehbarkeit aller Aktionen (Redeploy, Login, Wartung, Benutzerverwaltung). Sie steht Benutzer:innen mit der Permission `logs-access` zur Verfügung.

## Überblick
- Filterleiste mit Suchfeld, Zeitspanne, Kategorie und Status.
- Tabelle mit Severity-Farben, Nachricht, Zeitstempel und Kontextinformationen.
- Aktionen oberhalb der Tabelle: **Exportieren** und **Löschen**.

## Filtern
1. **Zeitfenster:** Datumsfelder „Von“ und „Bis“ setzen. Standardmäßig zeigt StackPulse die letzten 24 Stunden.
2. **Kategorie/Status:** Dropdowns nutzen, um z. B. `redeploy` oder `wartung` auszuwählen.
3. **Freitext:** Suchfeld durchsucht `message`, `entity_name` und `metadata`.
4. **Erweiterte Filter:** Klick auf „Weitere Filter“ öffnet zusätzliche Optionen (Actor, Stack-ID, Severity).

## Export
- Button **CSV exportieren** klickst du erst, nachdem die Filter stehen. StackPulse erstellt eine CSV-Datei mit denselben Parametern.
- Der Download startet im Browser; in containerisierten Umgebungen kannst du denselben Endpoint (`/api/logs/export`) auch automatisiert aufrufen.

## Löschen
- Einzelne Logs: Papierkorb in der Zeile (Permission `logs-delete`).
- Batch-Löschung: Button **Gefilterte Einträge löschen**; es erscheint ein Sicherheitsdialog mit Zusammenfassung der aktiven Filter.
- Beachte, dass gelöschte Logs nicht wiederhergestellt werden können.

## Detailansicht
- Klick auf eine Tabellenzeile, um ein Seitenpanel mit vollständigem JSON (`metadata`), Kontext (Stack, Benutzer, Quelle) und ggf. Redeploy-Timings zu öffnen.
- Über **Stack öffnen** gelangst du direkt zur Stacks-Seite mit gesetztem Filter.
