# Backend & API

Das Backend implementiert alle Anwendungsfälle über Express-Routen, Socket.IO für Echtzeit-Events und eine SQLite-Datenbank als Persistenzschicht. Dieser Abschnitt fasst die wichtigsten Module, Entitäten und Endpunkte zusammen.

## Laufzeit & Einstiegspunkte
- `backend/index.js` initialisiert Express, Socket.IO, lädt `.env`, sorgt für Schema-Validierung (`ensureDatabaseSchema`) und Default-Daten (`ensureSuperuserFromEnv`, `ensureDefaultsFromEnv`).
- Start via `npm start` (siehe `package.json`); Migrationen über `npm run migrate`.
- Datenbankdatei: `backend/data/stackpulse.db`, WAL-Modus aktiv.

## Module
| Modul | Pfad | Aufgabe |
|-------|------|---------|
| Auth/Superuser | `auth/superuser.js` | Registrieren/Verifizieren von Superusern, Login, Passwortvalidierung, Sicherheitsphrasen. |
| Users & Groups | `users/*`, `groups/*`, `permissions/*` | CRUD für Benutzer, Gruppen, Rechtezuweisung, Ableitung effektiver Berechtigungen. |
| Setup | `setup/index.js` | Verwaltung registrierter Portainer-Server, sichere Ablage der API-Keys, Setup-Status. |
| Logging | `logging/eventLogs.js` | Einheitliches Ereignislogging (Insert, Filter, Delete, Export). |
| Maintenance | `maintenance/state.js` + helper in `index.js` | Wartungsmodus, SSH-Konfiguration, Update-Skripte und Ausführung. |
| Portainer Proxy | Funktionen in `index.js` | Kommunikation mit Portainer (`axiosInstance` + dynamische `baseURL`), Environment-Erkennung und Redeploy-Strecke. |

## API-Überblick (Auszug)
### Setup & Server
| Methode | Route | Beschreibung |
|---------|-------|--------------|
| GET | `/api/setup/status` | Gibt zurück, ob Server/API-Key/Superuser vorhanden sind. |
| POST | `/api/setup/test-portainer` | Verifiziert URL + API-Key gegen Portainer. |
| POST | `/api/setup/portainer-stacks` | Listet Stacks (für Preview im Wizard). |
| POST | `/api/setup/complete` | Markiert Setup als abgeschlossen und hinterlegt Server/API-Key. |
| DELETE | `/api/setup/servers/:id` | Entfernt einen registrierten Portainer-Server. |
| PUT | `/api/setup/servers/:id/api-key` | Überschreibt API-Key. |
| PUT | `/api/setup/self-stack` | Speichert die ID des StackPulse-Stacks, damit dieser nicht redeployed wird.

### Authentifizierung
| Methode | Route | Beschreibung |
|---------|-------|--------------|
| POST | `/api/auth/login` | Username/Passwort-Login, setzt HTTP-only Cookie. |
| POST | `/api/auth/logout` | Session beenden & Cookie löschen. |
| GET | `/api/auth/session` | Liefert eingeloggten Benutzer + Permissions. |
| POST | `/api/auth/recover/verify` & `/reset` | Passwortreset über Sicherheitsphrase. |
| GET/POST/DELETE | `/api/auth/superuser/*` | Abfrage, Registrierung oder Entfernen des Superusers.

### Benutzer & Gruppen
| Methode | Route | Beschreibung |
|---------|-------|--------------|
| GET/POST | `/api/users` | Liste anlegen, neue Benutzer erstellen. |
| GET/PUT/DELETE | `/api/users/:id` | Details lesen, bearbeiten oder löschen. |
| PUT | `/api/users/:id/groups` | Gruppenmitgliedschaften aktualisieren. |
| PUT | `/api/users/:id/active` | Benutzer aktivieren/deaktivieren. |
| GET/POST | `/api/users/:id/security-phrase`, `/renew` | Sicherheitsphrase anzeigen bzw. neu generieren. |
| GET/POST | `/api/groups` | Gruppen auflisten oder neu anlegen. |
| PUT/DELETE | `/api/groups/:id` | Gruppe editieren oder entfernen. |
| GET/PUT | `/api/groups/:id/permissions` | Berechtigungen lesen/setzen.

### Stacks & Redeploy
| Methode | Route | Beschreibung |
|---------|-------|--------------|
| GET | `/api/stacks` | Aggregierte Liste inkl. Filter, Self-Stack-Blockade und Redeploy-Status. |
| PUT | `/api/stacks/:id/redeploy` | Redeploy eines einzelnen Stacks. |
| PUT | `/api/stacks/redeploy-selection` | Redeploy einer Liste übermittelter `stackIds`. |
| PUT | `/api/stacks/redeploy-all` | Redeploy aller Stacks (Permission `stacks-redeploy-all`). |

Das Backend veröffentlicht den Redeploy-Fortschritt parallel über Socket.IO (`redeployStatus` Event) und unterscheidet die Phasen `queued`, `started`, `success`, `error`, `info`.

### Logging & Wartung
| Methode | Route | Beschreibung |
|---------|-------|--------------|
| GET | `/api/logs` | Filterbare/Paginierbare Event-Logs. |
| DELETE | `/api/logs/:id` oder `/api/logs` | Einzelne oder gefilterte Logs löschen. |
| GET | `/api/logs/export` | CSV-Export anhand der Query-Filter. |
| GET/POST | `/api/maintenance/mode` | Status abfragen oder toggeln. |
| GET | `/api/maintenance/config` | Liefert Maintenance-Status, Update-Skript & SSH-Config. |
| PUT/DELETE | `/api/maintenance/ssh-config` | SSH-Credentials speichern/entfernen. |
| POST | `/api/maintenance/test-ssh` | Verbindungstest mit optionalem Override. |
| PUT/DELETE | `/api/maintenance/update-script` | Custom Update-Skript pflegen. |
| POST | `/api/maintenance/portainer-update` | Update-Kommando per SSH ausführen (mit Custom/Default-Skript). |

## Datenbank & Schema
- `ensureDatabaseSchema()` erzeugt Tabellen bei jedem Start, inklusive Default-Gruppen, Permissions, Settings, Server-Einträge und Trigger.
- Permissions werden anhand der Blueprint-Datei `backend/db/dbs` eingelesen. Jede Permission definiert Key, Label, Level (`full`, `read`, `none`) und Abhängigkeiten.
- Events werden in `event_logs` gespeichert. Relevante Felder:
  - `category`, `event_type`, `action`, `status`, `severity`
  - `entity_type`, `entity_id`, `entity_name`
  - `actor_type`, `actor_id`, `actor_name`
  - `context_type`, `context_id`, `context_label`
  - `message`, `metadata (JSON)`
- Filter-Parameter (`ids`, `categories`, `eventTypes`, `status`, `stackIds`, Zeitfenster) werden in `buildEventLogFilter` zentral verarbeitet.

## Berechtigungssystem
- Jeder Benutzer gehört zu beliebig vielen Gruppen; die effektiven Rechte ergeben sich aus der höchsten Ausprägung pro Permission.
- Superuser erhalten alle Berechtigungen und können nicht über das UI entzogen werden.
- `PermissionGate` im Frontend spiegelt die gleichen Keys. Wichtigste Bereiche:
  - `stacks-*` (Redeploy)
  - `logs-*`
  - `users-*` & `user-groups-*`
  - `maintenance-*` (inkl. Unterrechte `maintenance-server-*`, `maintenance-ssh-update`, `maintenance-update`)

## Redeploy-Workflow
1. Eingehender Request wird mit `maintenanceGuard` geprüft (Maintenance-Modus blockiert optional Redeploys).
2. Das Backend ermittelt den zugehörigen Portainer-Endpoint (`resolvePortainerEnvironmentId`).
3. Der Redeploy wird über Portainer ausgeführt (`/api/stacks/:id/redeploy`), Log-Einträge werden erstellt.
4. `broadcastRedeployStatus()` aktualisiert das In-Memory-Tracking (`redeployingStacks`) und sendet Socket.IO Events.
5. Fehler führen zu `event_logs`-Einträgen mit `severity=error`, UI zeigt Toasts via `ToastProvider`.

## Wartungs- und Updatepfad
- `maintenance/state.js` persistiert Aktivierung & Nachricht im Setting `maintenance_mode`.
- SSH-Konfigurationen (Host, Port, User, Passwort, extra args) werden verschlüsselt gespeichert (`getPortainerSshConfig`).
- Update-Skripte lassen sich überschreiben, Standard-Skript liegt in `DEFAULT_PORTAINER_UPDATE_SCRIPT` (Bash-Befehle).
- Update-Status hält Laufzeiten, letzte Ergebnisse und Logauszüge in-memory & Settings bereit.

## Erweiterungstipps
- Neue API-Routen sollten `requirePermission(..)` nutzen, Logging via `logEvent()` hinzufügen und – falls Portainer-Aufrufe stattfinden – das `axiosInstance` verwenden.
- Einstellungen stets über `db/settings.js` verwalten, damit UI & CLI konsistent bleiben.
- Für breaking DB-Änderungen existiert kein Migrations-Framework – erweitere `ensureDatabaseSchema` inkl. Versionsflag, um Idempotenz sicherzustellen.
