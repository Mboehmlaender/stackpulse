![StackPulse Logo](assets/images/stackpulse.png)

# 📦 StackPulse ![Release](https://img.shields.io/badge/release-v0.2-blue.svg) 

**StackPulse** ist eine kleine Web-App, die über die Portainer-API deine Docker-Stacks verwaltet und aktualisiert.  
Sie besteht aus einem **Backend (Node.js/Express)** und einem **Frontend (React/Tailwind)**.  

Ziel:  
- Übersicht über alle Stacks in deiner Portainer-Instanz  
- Später: Updates, Deployments und Monitoring  
- Bereitstellung als **Docker Image**, nutzbar über **docker-compose**  

---

## 🚀 Features & Roadmap

<details>
  <summary>✅ v0.1.0 – Initial Release</summary>

- Projektstruktur mit Frontend & Backend  
- Lokales Startskript (`scripts/start-dev.sh`)  
- Frontend zeigt Stacks an (über Backend)  
- API-Verbindung zu Portainer  
- Stack Redeploy  
- Bereitstellung eines Docker Images über GHCR  

</details>

<details>
  <summary>✅ v0.2.0 – Release</summary>

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

<details open>
  <summary>🟡 v0.3 – Release</summary>

### Backend
- [ ] Scheduler-Service mit Cron/Timer (Jobs erstellen, starten, stoppen, löschen)  
- [ ] Speicherung der Scheduler-Jobs in SQLite (Stack-ID, Zeit, Status, History)  
- [ ] API-Endpunkte für Scheduler-Verwaltung (CRUD + Statusabfrage)  
- [ ] Automatische Datenbereinigung: Duplikate bei Stack-IDs erkennen & entfernen
- [ ] Erweiterung der Logs  
- [ ] API für Filter & Suche (Stacks nach Name/Status abrufen)  

### Frontend
- [ ] UI für Scheduler (Stack auswählen, Zeit festlegen, Übersicht der Jobs)  
- [ ] Filter: Stacks nach Name oder Status durchsuchen  
- [ ] Benachrichtigungen im UI: erfolgreicher/fehlgeschlagener Redeploy (Toast + Notification-Center)  
- [ ] Anzeige & Verwaltung der Scheduler-Jobs (Tabelle mit Status, Pause/Resume/Delete)  
- [ ] Visualisierung der Datenbereinigung (Konflikt/Auto-Fix Meldungen)  

### Features
- [ ] Automatische Redeploys nach Zeitplan (einmalig oder wiederkehrend)  
- [ ] Frontend-Filter für schnellere Navigation bei vielen Stacks  
- [ ] Echtzeit-Feedback im UI (Notifications)  
- [ ] Datenkonsistenz sichern: keine doppelten Stack-IDs mehr

</details>

<details>
  <summary>🔮 Geplante Features (v0.4+)</summary>

- Notifications (z. B. via Webhooks oder Mail)  
- Authentifizierung & Benutzerverwaltung  
- Monitoring (Status, CPU/RAM)  
- Verbesserte UI/UX  
- Export/Import von Scheduler-Jobs (z. B. JSON)  
- Health-Checks nach Redeploy (automatisierte Tests, Statusprüfung)   

</details>

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
version: "2.4"
services:
    stackpulse:
        container_name: stackpulse
        image: ghcr.io/mboehmlaender/stackpulse
        ports:
          - '4001:4001'
        volumes:
          - stackpulse_data:/app/backend/data
        environment:
          PORTAINER_URL: "Your_Portainer_Server_Address"
          PORTAINER_API_KEY: "Your_Portainer_API_Key"
          PORTAINER_ENDPOINT_ID: "Your_Portainer_Endpoint_ID"
          SELF_STACK_ID: "Stackpulse ID"
        restart: unless-stopped

volumes:
  stackpulse_data:

```

Die PORTAINER_ENDPOINT_ID erhältst du, wenn du die die URL im Browser ansiehst, wenn du das Dashboard in Portainer öffnest:

![PORTAINER_ENDPOINT_ID](assets/images/ENDPOINT_ID.png)

Die 3 wäre in diesem Fall Endpoint-ID.

Die STACK_SELF_ID findest du, wenn du das Frontend von StackPulse öffnest:

![SELF_STACK_ID](assets/images/SELF_STACK_ID.png)

Diese ID kann erst nach dem Deploy von Stackpulse ausgelesen werden. Vergiss daher nicht, nach dem Hinterlegen der ID in den Variablen das Stack noch einmal zu redeployen!

---

## 📋 Voraussetzungen

- Node.js >= 20  
- Docker & Docker Compose  
- Zugang zu einer Portainer-Instanz (API-Key erforderlich)

---

## 🤝 Mitmachen

1. Repo forken  
2. Feature-Branch erstellen  
3. PR gegen `dev` öffnen  
