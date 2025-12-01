# Operations & Wartung

Dieser Abschnitt deckt typische Aufgaben für Betriebsteams ab – von Backups über Wartungsmodus bis zu Störungssuche.

**Relevante Rechte**
- `Superuser löschen`
- `Bereich & Navigation (Wartung)`

## Laufender Betrieb
- **Services überwachen**: StackPulse stellt nur einen Prozess bereit (Node.js/Express). Nutze Systemd/Docker Healthchecks, indem du regelmäßig `/api/auth/session` (für Auth) oder `/api/maintenance/update-status` (für Backend + DB) abfragst.
- **Ports**: Standardmäßig lauscht nur Port 4001 (HTTP + Socket.IO). Hinter einem Reverse Proxy sollte TLS terminiert werden.
- **Protokolle**: Das Backend loggt ausführlich auf STDOUT/STDERR (`console.log`). Sammle diese via Docker-Logs oder Journal.

## Backups & Wiederherstellung
1. **Container-Setup**: Mount `backend/data` via benanntem Volume (siehe `docker-compose.yml`).
2. **Backup**: Stoppe kurz den Container oder nutze `sqlite3 stackpulse.db ".backup 'stackpulse.db.bak'"` innerhalb der laufenden Instanz.
3. **Restore**: Ersetze die Datei im Volume und starte die App neu. Beim ersten Start führt `ensureDatabaseSchema` automatisch eventuelle Nachmigrationen aus.

## Benutzer- & Rechteverwaltung
- Superuser können über `/api/auth/superuser/*` oder im UI registriert werden. Entfernen ist nur mit `Superuser löschen` möglich.
- Benutzerkonten lassen sich temporär deaktivieren (`/api/users/:id/active`). Die Historie bleibt erhalten.
- Sicherheitsphrasen sind notwendig für Passwort-Reset. Admins können neue Phrasen erzeugen (`/api/users/:id/security-phrase/renew`), müssen diese aber dem Benutzer sicher zustellen.

## Wartungsmodus & Updates
- Maintenance Mode aktivieren: `curl -X POST http://host:4001/api/maintenance/mode -H 'Content-Type: application/json' -d '{"active":true,"message":"Cluster Upgrade"}'` (Recht `Bereich & Navigation (Wartung)`). Das UI informiert alle Nutzer und blockiert Redeploys.
- SSH-/Update-Setup: Hinterlege Host, Port, Benutzer, Passwort (optional) und zusätzliche SSH-Argumente. Passwörter werden verschlüsselt gespeichert (`PORTAINER_SSH_SECRET`).
- Update-Skript: Das Default-Skript (`DEFAULT_PORTAINER_UPDATE_SCRIPT`) führt `docker stop`, `docker run` etc. aus. Du kannst im UI oder via API ein eigenes Skript setzen – wird erst aktualisiert, wenn kein Update läuft.
- Update anstoßen: `POST /api/maintenance/portainer-update` triggert die SSH-Kommandos. Status & Logausgaben können über `/api/maintenance/update-status` überwacht werden.

## Logs & Compliance
- Ereignislogs enthalten jede Redeploy-, Auth- und Verwaltungsaktion. Export über `GET /api/logs/export` (CSV) oder automatisiert mittels Cron (Query-Parameter übernehmen Filter).
- Datenbereinigung: Nutze `DELETE /api/logs/:id` oder `DELETE /api/logs?before=<ISO>` um alte Einträge zu entfernen. Achtung: Aktionen sind nicht reversibel.
- Für Offload kannst du per Script regelmäßig Exporte ziehen und anschließend löschen.

## Troubleshooting
| Symptom | Prüfschritte |
|---------|--------------|
| **Setup schlägt fehl (PORTAINER_URL_NOT_CONFIGURED)** | Stelle sicher, dass entweder `PORTAINER_URL` gesetzt ist oder im Setup-UI ein Server gespeichert wurde (`servers`-Tabelle prüfen). |
| **Redeploy hängt in `queued`** | `/api/maintenance/update-status` auf laufende Updates prüfen, `redeployingStacks` im Log verfolgen; ggf. Portainer-API erreichbar? |
| **Login nicht möglich** | Über `backend/logs` nach Auth-Fehlern suchen, Cookie-Konfiguration prüfen (`AUTH_COOKIE_SECURE` bei HTTP?). |
| **SSH-Test fehlgeschlagen** | `POST /api/maintenance/test-ssh` mit temporären Credentials testen, Container-Logs auf `SSH Test fehlgeschlagen` untersuchen. |
| **SQLite Locked** | Stelle sicher, dass kein paralleler Backup-Prozess läuft. WAL-Modus erlaubt mehrere Leser, blockiert aber bei langen Schreibtransaktionen (Check Logs auf `SQLITE_BUSY`). |

## Sicherheitsempfehlungen
- Setze `AUTH_COOKIE_SECURE=true` hinter TLS und konfiguriere einen Reverse Proxy (z. B. Traefik, Nginx).
- Isoliere das Admin-Interface durch VPN oder IP-Filter.
- Drehe API-Keys regelmäßig: `/api/setup/servers/:id/api-key` aktualisiert Schlüssel ohne Neuinstallation.
- Nutze dedizierte StackPulse-Benutzer in Portainer, damit Berechtigungen klar getrennt bleiben.

Mit diesen Richtlinien lässt sich StackPulse sicher betreiben und warten.
