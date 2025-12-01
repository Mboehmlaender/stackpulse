# Lokale Entwicklung & Migration

Dieser Abschnitt richtet sich an Contributor:innen, die StackPulse lokal bauen oder erweitern möchten. Für produktive Deployments nutze die GHCR-Images wie im Getting Started beschrieben.

## Voraussetzungen
- Node.js **>= 20** und npm
- Shell-Zugang zum Host
- Docker (optional) für lokale Tests

## Repository vorbereiten
```bash
# Repository klonen
# git clone <repo-url>
cd stackpulse

# Startskript ausführbar machen
chmod +x scripts/start-dev.sh
```

## Schnellstart (Dev-Skript)
Das Skript `scripts/start-dev.sh` richtet Backend und Frontend ein und startet beide im Dev-Modus:
1. Backend: `npm install`, `npm run migrate`, `npm start`
2. Frontend: `npm install`, `npm run dev` (Port 5173) und einmalig `npm run build` für statische Assets

Nach dem Start:
- Frontend Dev Server: http://localhost:5173
- Backend API & statische Assets: http://localhost:4001

Stoppen mit `STRG+C` in der Shell, in der das Skript läuft.

## Manuelles Starten
```bash
# Backend
cd backend
npm install
npm run migrate
PORTAINER_URL=https://portainer.local npm start

# Frontend (zweite Shell)
cd frontend
npm install
npm run dev
```
Das Backend liest Umgebungsvariablen beim Start. Alternativ kannst du eine `.env` neben `backend/index.js` anlegen.

## Datenbank & Migration
- Datei: `backend/data/stackpulse.db` (SQLite, WAL aktiviert)
- Migration: `npm run migrate` (führt `backend/db/ensure.js` aus, erzeugt/aktualisiert Schema & Defaults)
- Backup: Datei oder Volume regelmäßig sichern; enthält Benutzer, Logs und gespeicherte Secrets

## Hinweise
- Die lokalen Builds sind für Entwicklung gedacht. Für Deployments verwende `ghcr.io/mboehmlaender/stackpulse`.
- Einige Einstellungen (z. B. Server-URL, API-Key, SSH-Config) kannst du im UI setzen; für lokale Tests reichen die ENV-Defaults und das Setup-UI.
