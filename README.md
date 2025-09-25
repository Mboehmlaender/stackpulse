# 📦 StackPulse

**StackPulse** ist eine kleine Web-App, die über die Portainer-API deine Docker-Stacks verwaltet und aktualisiert.  
Sie besteht aus einem **Backend (Node.js/Express)** und einem **Frontend (React/Tailwind)**.  

Ziel:  
- Übersicht über alle Stacks in deiner Portainer-Instanz  
- Später: Updates, Deployments und Monitoring  
- Bereitstellung als **Docker Image**, nutzbar über **docker-compose**  

---

## 🚀 Features (0.1 Roadmap)

- [x] Projektstruktur mit Frontend & Backend  
- [x] Lokales Startskript (`scripts/start-dev.sh`)  
- [x] Frontend zeigt Stacks an (über Backend)  
- [x] API-Verbindung zu Portainer
- [x] Stack Redeploy 
- [x] Docker Image im ghcr zur Verfügung stellen

---

## 🗂️ Projektstruktur

```bash
stackpulse/
├── backend/          # Node.js Backend mit Express
├── frontend/         # React Frontend mit Tailwind
├── scripts/          # Lokale Hilfsskripte (nicht Teil des Images)
│   ├── git-push.sh              #nicht relevant
│   └── merge-dev-to-master.sh   #nicht relevant
│   └── merge-feature-to-dev.sh  #nicht relevant
│   └── start-dev.sh             #Skript für den lokalen Start
│   └── switch-branch.sh         #nicht relevant
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
