# Stacks-Seite

Die Stacks-Ansicht ist der Startpunkt nach dem Login und liefert einen Überblick über alle Stacks der angebundenen Portainer-Instanz.

**Relevante Rechte**
- `Redeploy einzeln`
- `Redeploy Auswahl`
- `Redeploy Alle`

## Aufbau
- **Header** mit Suchfeld, Filterchips für Status sowie Buttons für Redeploy-Aktionen.
- **Tabelle** mit Name, Endpoint, Status, letzte Aktion, Redeploy-Status und verfügbaren Buttons.
- **Live-Status**: Über Socket.IO wird jede Veränderung (queued/started/success/error) sofort eingeblendet.

## Filter & Suche
1. Verwende das Suchfeld oben rechts, um nach Namen oder IDs zu filtern.
2. Statuschips (z. B. „running“, „warning“) toggeln per Klick und lassen sich kombinieren.
3. Über die Spaltenköpfe kannst du sortieren; ein erneuter Klick kehrt die Reihenfolge um.

## Redeploy-Aktionen
| Aktion | Voraussetzung | Vorgehen |
|--------|---------------|----------|
| **Einzelner Stack** | Recht `Redeploy einzeln` | Button **Redeploy** in der jeweiligen Zeile klicken und bestätigen. |
| **Mehrere Stacks** | Recht `Redeploy Auswahl` | Checkboxen der gewünschten Stacks aktivieren, anschließend **Redeploy Auswahl**. |
| **Alle Stacks** | Recht `Redeploy Alle` | Button **Redeploy alle** auslösen. Nutze vorher Filter, um sicherzugehen, dass alle Stacks korrekt angezeigt werden. |

Während eines Redeploys erscheint pro Stack ein Fortschrittsbadge. Du kannst das Panel schließen; beim nächsten Besuch wird der aktuelle Status aus dem Backend gelesen.

## Redeploy-Status verstehen
- **Queued** – Auftrag ist vorgemerkt.
- **Started** – Portainer verarbeitet Redeploy.
- **Success** – Vorgang erfolgreich abgeschlossen.
- **Error** – Fehlerdetails findest du in der Logs-Seite.
- **Info** – Informative Hinweise, etwa wenn Portainer einen Stack überspringt.

## Selbstschutz
- Falls du die Variable `SELF_STACK_ID` gesetzt hast, markiert StackPulse den eigenen Stack als „geschützt“. Redeploy-Buttons werden deaktiviert und mit einem Info-Tooltip versehen.

## Troubleshooting aus der Ansicht
- Klicke auf das Warnsymbol in der Tabellenzeile, um Fehlerdetails einzublenden.
- Nutze den Link „Zu Logs springen“, der direkt eine gefilterte Ansicht in der Log-Seite öffnet (Stack-ID ist vorausgewählt).
