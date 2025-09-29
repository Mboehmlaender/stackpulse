# 📦 StackPulse

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

<details open>
  <summary>🟡 v0.2.0 – In Entwicklung</summary>

### Backend
- [ ] Anbindung einer SQLite-Datenbank  
- [ ] Logging der Redeploy-Aktionen in SQLite speichern  
- [ ] API-Endpunkte für Log-Abfragen  

### Frontend
- [ ] Anzeige der Logs (inkl. Statusfarben)  
- [ ] UI-Komponenten für Log-Details  

### Features
- [ ] Selektive Auswahl: einzelne Stacks oder Services neu deployen  

</details>

<details>
  <summary>🔮 Geplante Features (v0.3+)</summary>

- Notifications (z. B. via Webhooks oder Mail)  
- Authentifizierung & Benutzerverwaltung  
- Monitoring (Status, CPU/RAM)  
- Verbesserte UI/UX  

</details>


---

## 🗂️ Projektstruktur

```bash
stackpulse/
├── backend/          # Node.js Backend mit Express
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
        environment:
          - PORTAINER_URL=Deine_Portainer_Adresse/
          - PORTAINER_API_KEY=Dein_Portainer_API_Key
          - PORTAINER_ENDPOINT_ID=Deine_Portainer_Endpoint_ID
```

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
