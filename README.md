![StackPulse Logo](assets/images/stackpulse.png)

# 📦 StackPulse ![Release](https://img.shields.io/badge/release-v0.5-blue.svg) 

**StackPulse** ist eine kleine Web-App, die über die Portainer-API deine Docker-Stacks verwaltet und aktualisiert.  
Aktuell funktioniert StackPulse nur mit der Business-Edition von Portainer. Die Communitiy-Edition wird in einem späteren Release implementiert!
Sie besteht aus einem **Backend (Node.js/Express)** und einem **Frontend (React/Tailwind)**.  

Ziel:  
- Übersicht über alle Stacks in deiner Portainer-Instanz  
- Später: Updates, Deployments und Monitoring  
- Bereitstellung als **Docker Image**, nutzbar über **docker-compose**  

---

## 🚀 Features & Roadmap

<details>
  <summary>✅ v0.1 – Initial Release</summary>

- Projektstruktur mit Frontend & Backend  
- Lokales Startskript (`scripts/start-dev.sh`)  
- Frontend zeigt Stacks an (über Backend)  
- API-Verbindung zu Portainer  
- Stack Redeploy  
- Bereitstellung eines Docker Images über GHCR  

</details>

<details>
  <summary>✅ v0.2 – Release</summary>

### Backend
- [x] Anbindung einer SQLite-Datenbank  
- [x] Logging der Redeploy-Aktionen in SQLite speichern  
- [x] API-Endpunkte für Log-Abfragen  
- [x] Funktionen für Pagination, Löschen und Export 

### Frontend
- [x] Anzeige der Logs (inkl. Statusfarben)  
- [x] UI-Komponenten für Log-Details  
- [x] Filterfunktionen für die Logs
- [x] Pagination, Lösch- und Exportanzeigen

### Features
- [x] Selektive Auswahl: einzelne Stacks oder Services neu deployen  

</details>

<details>
  <summary>✅ v0.3 – Release</summary>

### Backend
- [x] Automatische Datenbereinigung: Duplikate bei Stack-IDs erkennen & entfernen
- [x] Erweiterung der Logs  
- [x] API für Filter & Suche (Stacks nach Name/Status abrufen)  

### Frontend
- [x] Filter: Stacks nach Name oder Status durchsuchen 
- [x] Benachrichtigungen im UI: erfolgreicher/fehlgeschlagener Redeploy (Toast)  
- [x] Visualisierung der Datenbereinigung (Konflikt/Auto-Fix Meldungen)  

### Features
- [x] Frontend-Filter für schnellere Navigation bei vielen Stacks  
- [x] Echtzeit-Feedback im UI (Notifications)  
- [x] Datenkonsistenz sichern: keine doppelten Stack-IDs mehr

</details>

<details>
<summary>✅ v0.4 – Release</summary>

### Backend
- keine Änderungen

### Frontend
- [x] GUI komplett überarbeitet 
- [x] Umstellung auf Material Tailwind
- [x] Dashboard von Creative Tim als neues Frontend

### Features
- [x] Neue, übersichtliche Oberfläche im Material Design
- [x] leicht erweiterbar durch vorgefertigte Komponenten 
- [x] kleine Bugfixes

</details>

<details open>
<summary>✅ v0.5 – Release</summary>

### 🛠️ Backend
- [x] Neue API-Endpunkte für Logging, Benutzer- und Gruppenverwaltung sowie Superuser-Registrierung  
- [x] Authentifizierung und Log-In  
- [x] Erweiterte Protokollierung und Datenbank-Migration  
- [x] Präzisere Steuerung der globalen Benutzerrechte  

### 💻 Frontend
- [x] Neue Log-In-Seite  
- [x] Benutzer- und Gruppenverwaltung mit granularen Rechteeinstellungen  
- [x] Erweiterte Log-Ausgabe mit Filtern und Suchoptionen  
- [x] Konsolidierte und vereinheitlichte Ansichten im Dashboard  

### ✨ Features
- [x] Vollständiges Authentifizierungs- und Berechtigungssystem  
- [x] Erweiterte Logs in allen Bereichen  
- [x] Speicherung von Server- und Superuser-Einstellungen in der Datenbank  
</details>

<details open>

<summary>🟡 v0.6 – In Entwicklung</summary>

### Backend

### Frontend

### Features

</details>

<details open>
  <summary>🔮 Geplante Features (v0.6+)</summary>

- Notifications (z. B. via Webhooks oder Mail)  
- Monitoring (Status, CPU/RAM)  
- Verbesserte UI/UX  
- Erweiterte Filterungen udn Sortierungen
- Multi-Server Verwaltung
- Integration Community Edition
</details>

---

## 🗂️ Projektstruktur

```bash
stackpulse/
├── backend/          # Node.js Backend mit Express
│   └── data          # SQlite Datenbank
│   └── db            # Datenbank-Integration
├── frontend/         # React Frontend mit Tailwind
├── scripts/          # Lokale Hilfsskripte (nicht Teil des Images)
│   └── start-dev.sh  #Skript für den lokalen Start
├── Dockerfile        # Multi-Stage Build für Frontend + Backend
├── docker-compose.yml
└── README.md
```

---

## 🔧 Lokaler Start

### 1. Dev-Server starten (Frontend + Backend)
```bash
./scripts/start-dev.sh
```

➡️ Danach:  
- Frontend → http://Deine-Server-IP:5173  

---

## 🐳 Docker-Setup

### Mit Compose starten
```bash
version: '3.8'
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
      - PORTAINER_URL=Your_Portainer_Server_Adress (optional)
      - PORTAINER_API_KEY=Your_Portainer_API_Key (optional)
      - SUPERUSER_USERNAME=Your_Superuser_Username (optional)
      - SUPERUSER_EMAIL=Your_Superuser_Email (optional)
      - SUPERUSER_PASSWORD=Your_Superuser_Password (optional)
      - SELF_STACK_ID=Your_StackPulse_Stack_ID (optional)
volumes:
  stackpulse_data:


```
## 📋 Voraussetzungen

- Node.js >= 20  
- Docker & Docker Compose  
- Zugang zu einer Portainer-Instanz (API-Key erforderlich)

---

## 🤝 Mitmachen

1. Repo forken  
2. Feature-Branch erstellen  
3. PR gegen `dev` öffnen  
