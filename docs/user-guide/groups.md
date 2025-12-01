# Benutzergruppen & Rechte

Dieser Bereich verwaltet Rollenmodelle und bestimmt, welche Aktionen Benutzer:innen durchführen dürfen.

**Relevante Rechte**
- `Bereich & Navigation (Benutzergruppen)`
- `Benutzergruppen bearbeiten`
- `Benutzergruppen löschen`

## Gruppen anlegen
1. Button **Gruppe erstellen** wählen.
2. Pflichtfelder:
   - **Name** (z. B. „Ops Team“)
   - **Beschreibung** (Hilfestellung für Kolleg:innen)
3. Optional Tag-Farbe oder Icon setzen (für bessere Übersicht in der Benutzerliste).
4. Speichern – die Gruppe erscheint sofort in der Übersicht.

## Gruppen bearbeiten
- Zeile anklicken, um das Detailpanel zu öffnen.
- Du kannst Name, Beschreibung und Zugehörige Benutzer (nur Anzeige) sehen.
- Zum Bearbeiten der Rechte klicke auf **Berechtigungen bearbeiten**.

## Rechte vergeben
Der Rechte-Dialog zeigt die gesamte Permissionstruktur in Kategorien (Stacks, Logs, Benutzer, Wartung etc.).

1. Wähle die gewünschte Kategorie aus.
2. Setze für jede Permission einen Level:
   - **none** – kein Zugriff
   - **read** – Zugriff auf Ansicht/Lesen
   - **full** – volle Bearbeitungsrechte
3. Abhängigkeiten werden automatisch hervorgehoben. Beispiel: Um `Logs löschen` nutzen zu dürfen, muss `Bereich & Navigation (Logs)` mindestens `Vollzugriff` sein.
4. Speichern bestätigt die Anpassungen. StackPulse aktualisiert sofort die effektiven Rechte aller Benutzer in dieser Gruppe.

## Benutzer zu Gruppen hinzufügen
- Dies geschieht im Benutzer-Detailpanel (siehe [Benutzerverwaltung](users.md)).
- Die Liste zeigt alle vorhandenen Gruppen; ein Benutzer kann mehreren Gruppen angehören.
- Die effektiven Rechte sind die jeweils höchsten Levels aller Gruppen.

## Gruppen löschen
- Nur möglich, wenn keine Benutzer ausschließlich von dieser Gruppe abhängen (es erfolgt ein Warnhinweis).
- Löschen entfernt keine Benutzer, aber deren effektive Rechte können sich dadurch verringern.

## Best Practices
- Erstelle zunächst eine Basisgruppe (z. B. „Viewer“) mit Leserechten für Stacks und Logs.
- Verwende separate Gruppen für sensible Aktionen wie Wartung oder Superuser-Verwaltung.
- Nutze sprechende Beschreibungen, damit Kolleg:innen sofort erkennen, wofür eine Gruppe gedacht ist.
