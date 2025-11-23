# Architektur

StackPulse folgt einer klassischen Client/Server-Architektur, bei der das Backend den Single-Source-of-Truth darstellt und das Frontend ausschließlich über wohldefinierte REST- und Socket.IO-Schnittstellen kommuniziert.

```text
┌────────────┐      HTTPS + WebSocket      ┌───────────────┐      HTTPS       ┌────────────────┐
│  Frontend  │ ─────────────────────────▶  │   Backend     │ ───────────────▶ │ Portainer API │
│ (React)    │ ◀───── Auth-Cookie + JSON ─ │ (Express)     │ ◀─────────────── │  Business Ed.  │
└────────────┘      Redeploy Events       └───────────────┘   (Axios Proxy)   └────────────────┘
                                             │
                                             ▼
                                     SQLite Datenbank
```

## Hauptschichten
- **Frontend** (Vite + Material Tailwind): stellt alle Views, Formulare, Tabellen und Echtzeit-Widgets bereit. Die `AuthProvider`-Komponente verwaltet Session, Permissions und Socket-Verbindungen.
- **Backend** (Express + better-sqlite3): aggregiert Daten aus Portainer, persistiert Benutzer/Gruppen/Logs, verwaltet Sessions und stößt Redeploy- sowie Wartungsprozesse an.
- **Persistenz** (SQLite): Datei `backend/data/stackpulse.db`, WAL-Modus aktiviert. Tabellen umfassen u. a. `users`, `groups`, `permissions`, `servers`, `server_api_keys`, `event_logs`, `settings` sowie Hilfstabellen für Tokens und Sicherheitspassphrasen.

## Datenflüsse
1. **Setup-Phase**: `/api/setup/*` nimmt Serverdaten entgegen, verschlüsselt API-Keys (`aes-256-gcm` via `PORTAINER_API_SECRET`) und erstellt Einträge in `servers`/`server_api_keys`.
2. **Authentication**: `/api/auth/login` erstellt Sessions (JWT-ähnliche Tokens in Cookies), `AuthProvider` ruft `/api/auth/session` zyklisch ab und speichert Berechtigungen.
3. **Stack-Übersicht**: Frontend ruft `/api/stacks` auf. Das Backend proxyt `Portainer /api/endpoints/:id/docker/stacks`, ergänzt Caching, interne Metadaten und liefert Redeploy-Status.
4. **Redeploy**: UI stößt `/api/stacks/:id/redeploy`, `/api/stacks/redeploy-selection` oder `/api/stacks/redeploy-all` an. Das Backend ruft Portainer-Endpoints, protokolliert Events und broadcastet Fortschritt via Socket.IO `redeployStatus`.
5. **Logging**: Jeder relevante Vorgang erzeugt Einträge in `event_logs` (siehe `logging/eventLogs.js`). Frontend filtert/paginiert über `/api/logs` und kann Exporte `/api/logs/export` herunterladen.
6. **Wartung**: `/api/maintenance/*` verwaltet Maintenance-Mode, SSH-Zugänge, Update-Skripte und serverseitige Settings (`db/settings.js`).

## Verzeichnis-Referenz
| Pfad | Inhalt |
|------|--------|
| `backend/index.js` | Herzstück der API inkl. Routing, Socket.IO, Redeploy, Setup, Auth. |
| `backend/auth/` | Superuser-Verwaltung, Passwort- und Tokenfunktionen, Sicherheitsphrasen. |
| `backend/db/` | SQLite-Initialisierung (`ensure.js`/`schemaEnsure.js`), Settings-Layer, DB-Blueprints. |
| `backend/logging/` | Event-Log Modellierung, Filter/Export/Delete. |
| `backend/groups/`, `backend/users/`, `backend/permissions/` | Domain-Logik für Benutzer- & Rechteverwaltung. |
| `backend/maintenance/` | Maintenance-Mode sowie SSH-/Update-Konfiguration. |
| `frontend/src/` | React-App (Layouts, Pages, Widgets, Provider). `routes.jsx` definiert Navigation & Permissions. |
| `scripts/` | Hilfsskripte (z. B. `start-dev.sh`). |
| `Dockerfile`, `docker-compose*.yml` | Build- & Deployment-Spezifikation. |

## Konfiguration & Secrets
- API-Keys und Passwörter werden verschlüsselt in SQLite abgelegt (`server_api_keys`, `settings`).
- Settings (Maintenance, Update-Skripte, SSH) nutzen `db/settings.js` mit JSON-Serialisierung.
- Das Backend erzwingt HTTPS-Requests Richtung Portainer (`https.Agent` mit deaktivierter Zertifikatsprüfung für interne Netze).
- Socket.IO lauscht auf demselben Port wie Express (`/socket.io`). CORS ist aktuell für alle Origins offen – für produktive Deployments empfiehlt sich ein Reverse Proxy mit Authentifizierung.

## Skalierung & Grenzen
- SQLite eignet sich für Einzelinstanzen. Für höhere Last empfiehlt sich eine Umstellung auf Postgres/MySQL (der Code kapselt Zugriffe weitgehend in `db/*`).
- Redeploy-Operationen werden seriell behandelt (`redeployingStacks` + Status-Caching). Parallele Ausführung ist möglich, solange Portainer dies unterstützt.
- Logging wird ausschließlich serverseitig betrieben; Client-seitige Filterung erfolgt über Query-Parameter.

Die weiteren Kapitel vertiefen Backend- und Frontend-spezifische Details.
