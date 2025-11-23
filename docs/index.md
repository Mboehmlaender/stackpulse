# StackPulse

StackPulse ist eine eigenständige Web-Anwendung, die die Portainer Business Edition über deren API steuert und dadurch Redeploys, Wartungsskripte sowie das Berechtigungs- und Logging-Konzept zentralisiert. Die Lösung besteht aus einem Node.js/Express Backend, einem React-Frontend auf Basis von Material Tailwind sowie einer eingebetteten SQLite-Datenbank, die ohne zusätzliche Infrastruktur betrieben werden kann.

## Warum StackPulse?
- **Schneller Überblick** über sämtliche Stacks einer Portainer-Instanz inkl. Status, Filter und Suche
- **Redeploy-Orchestrierung** aus einem UI heraus – einzelne Stacks, Auswahlen oder komplette Umgebungen
- **Auditierbare Historie** durch strukturierte Event-Logs mit Export-, Lösch- und Filterfunktionen
- **Feingranulare Rechteverwaltung** mit Gruppenrechten, Superuser-Handling und Sicherheitsphrasen
- **Wartungsautomatisierung** (SSH Update-Skripte, Maintenance-Mode) ohne direkten Portainer-Zugang
- **Bereitstellung als Docker-Image** sowie als lokale Dev-Umgebung via `scripts/start-dev.sh`

## Technische Eckdaten
| Baustein    | Technologie | Beschreibung |
|-------------|-------------|--------------|
| Backend     | Node.js 20, Express, Axios, Socket.IO, better-sqlite3 | Stellt REST-API, Authentifizierung, Rechte, Logging, Redeploy-Queue und Portainer-Proxy bereit. |
| Datenhaltung| SQLite (Datei `backend/data/stackpulse.db`) | Persistente Speicherung von Benutzern, Gruppen, Servern, API-Keys, Logs und Einstellungen. |
| Frontend    | React 18, Vite, Material Tailwind Dashboard | Dashboard mit Auth-Flow, Stacks, Logs, Benutzer- und Wartungsansichten. |
| Container   | Dockerfile + Compose | Multi-Stage Build für Frontend + Backend, Datenvolumen für SQLite. |

## Release-Status
- **v0.5 (aktuell)** – vollständiges Auth/Berechtigungssystem, Benutzer- & Gruppenverwaltung, erweiterte Logs
- **v0.4** – neues UI auf Basis des Material Tailwind Dashboards
- **v0.3** – Such- & Filterfunktionen, Konfliktbehandlung für Stack-IDs, UI-Benachrichtigungen
- **v0.2** – SQLite-Logging inkl. Export/Pagination, Redeploy-Selektor
- **v0.1** – Grundstruktur, API-Anbindung, erstes Redeploy

Weitere geplante Features (Notifications, Monitoring, Multi-Server, Portainer CE) findest du in der [Roadmap im README](../README.md).

## Wie geht es weiter?
- [Getting Started](getting-started.md) erläutert Installation, Konfiguration und erste Schritte.
- [Architektur](architecture.md) beschreibt Aufbau, Verzeichnisse und Datenflüsse.
- [Backend](backend.md) fasst API, Datenbank und Sicherheitsschichten zusammen.
- [Frontend](frontend.md) dokumentiert Layout, Routen und Komponenten.
- [Operations & Wartung](operations.md) enthält Betriebshinweise und Troubleshooting.
