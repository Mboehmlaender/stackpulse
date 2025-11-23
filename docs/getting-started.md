# Getting Started

Dieser Leitfaden hilft dir, StackPulse lokal oder als Container aufzusetzen und die ersten Schritte im UI abzuschließen.

## Voraussetzungen
- Node.js **>= 20** und npm für lokale Entwicklung
- Docker & Docker Compose (optional aber empfohlen für Deployment)
- Zugriff auf eine **Portainer Business Edition** samt API-Key
- Shell-Zugang zum Host, auf dem StackPulse laufen soll

## Repository & Abhängigkeiten
```bash
# Repository klonen
# git clone <repo-url>
cd stackpulse

# Skript ausführbar machen
chmod +x scripts/start-dev.sh
```

## Lokale Dev-Umgebung
Das Skript `scripts/start-dev.sh` richtet Backend und Frontend automatisch ein:

1. Backend: `npm install`, `npm run migrate` (erstellt/aktualisiert `backend/data/stackpulse.db`), `npm start`
2. Frontend: `npm install`, `npm run dev` (Port 5173) und ein einmaliges `npm run build`, um statische Assets ins Backend zu spiegeln

Nach erfolgreichem Start:
- Frontend dev server: http://localhost:5173
- Backend API & statische Assets: http://localhost:4001

Zum Stoppen STRG+C verwenden.

## Manuelles Starten
```bash
# Backend
cd backend
npm install
npm run migrate
PORTAINER_URL=https://portainer.local npm start

# Frontend in zweiter Shell
cd frontend
npm install
npm run dev
```
Das Backend liest Umgebungsvariablen beim Start. Alternativ kannst du eine `.env` neben `backend/index.js` anlegen.

## Zentrale Umgebungsvariablen
| Variable | Beschreibung |
|----------|--------------|
| `PORTAINER_URL` | Basis-URL zu deiner Portainer-Instanz (inkl. Protokoll). Kann später im Setup-UI überschrieben werden. |
| `PORTAINER_API_KEY` | API-Key für Portainer. Wird in der DB verschlüsselt abgelegt, sobald du ihn im Setup speicherst. |
| `PORTAINER_SERVER_NAME` | Optionaler Anzeigename für den Server während des Setups. |
| `PORTAINER_API_SECRET` | Überschreibt den Schlüssel, der zur Verschlüsselung des API-Keys verwendet wird. |
| `SUPERUSER_USERNAME`, `SUPERUSER_EMAIL`, `SUPERUSER_PASSWORD` | Legt einen Superuser automatisch beim Start an (falls nicht vorhanden). |
| `SELF_STACK_ID` | Stack-ID von StackPulse selbst. Wird genutzt, um eigene Redeploys zu blockieren. |
| `AUTH_COOKIE_NAME`, `AUTH_SESSION_TTL_MS`, `AUTH_COOKIE_SECURE` | Feintuning für die Session-Verwaltung der API. |
| `SECURITY_PHRASE_SECRET` | Seed für die Generierung kryptografischer Sicherheitsphrasen. |
| `PORTAINER_SSH_SECRET` | Secret für SSH-Passwortverschlüsselung (Wartungs-Update). |
| `DISPLAY` | Wird an Kindprozesse weitergereicht, wenn Portainer-Updates ausgelöst werden müssen (Default `:9999`). |

Weitere Einstellungen (SSH-Config, Update-Skripte) verwaltest du später direkt im Maintenance-Bereich des UI.

## Ersteinrichtung im UI
1. Öffne das Frontend (`/setup` führt dich automatisch durch den Wizard).
2. Lege den Portainer-Server und den zugehörigen API-Key an – StackPulse testet die Verbindung per `/api/setup/test-portainer`.
3. Registriere einen Superuser oder verwende den per Umgebungsvariablen automatisch angelegten Account.
4. Nach erfolgreicher Einrichtung kannst du dich anmelden und erhältst Zugriff auf Dashboard, Logs, Benutzer & Wartung.

## Docker-Deployment
```yaml
# docker-compose.yml (Auszug)
services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "4001:4001"
    volumes:
      - stackpulse_data:/app/backend/data
    restart: unless-stopped
    environment:
      - PORTAINER_URL=https://portainer.example.com
      - PORTAINER_API_KEY=xxxx
      - SUPERUSER_USERNAME=admin
      - SUPERUSER_EMAIL=admin@example.com
      - SUPERUSER_PASSWORD=changeme
      - SELF_STACK_ID=123
volumes:
  stackpulse_data:
```

1. `docker compose up -d --build`
2. Das Frontend ist anschließend unter Port 4001 (via Backend `public/`) erreichbar.
3. Datenbank & Einstellungen liegen im benannten Volume `stackpulse_data`.

## Datenbank & Migration
- Datei: `backend/data/stackpulse.db`
- Migration: `npm run migrate` (führt `backend/db/ensure.js` aus und erzeugt Schema, Rechte, Defaults)
- Backup: Datei oder Volume regelmäßig sichern; enthält Benutzer, Logs und gespeicherte Secrets.

Damit bist du bereit für die tieferen Kapitel zu Architektur sowie Backend- und Frontend-Details.
