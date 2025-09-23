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
- [ ] Docker-Image bauen & per Compose deployen  

---

## 🗂️ Projektstruktur

```bash
stackpulse/
├── backend/          # Node.js Backend mit Express
├── frontend/         # React Frontend mit Tailwind
├── scripts/          # Lokale Hilfsskripte (nicht Teil des Images)
│   ├── start-dev.sh
│   └── create-structure.sh
├── Dockerfile        # Multi-Stage Build für Frontend + Backend
├── docker-compose.yml
└── README.md
```

---

## 🔧 Lokale Entwicklung

### 1. Dev-Server starten (Frontend + Backend)
```bash
./scripts/start-dev.sh
```

➡️ Danach:  
- Frontend → http://localhost:5173  
- Backend → http://localhost:3000  

---

## 🐳 Docker-Setup

### Image bauen
```bash
docker build -t stackpulse:dev .
```

### Mit Compose starten
```bash
docker-compose up -d
```

---

## 🌳 Git-Workflow

- `master` → Release-Branch  
- `dev` → Entwicklung & Integration  
- `feature/*` → einzelne Features  

**Ablauf:**  
1. Feature-Branch anlegen (`git checkout -b feature/...`)  
2. Entwicklung & lokaler Test  
3. Merge → `dev` (Review/Test)  
4. Merge → `master` für Release (z. B. `v0.1`)  

---

## 📦 Release

1. Alles auf `master` mergen  
2. Tag setzen:  
   ```bash
   git tag -a v0.1 -m "First release"
   git push origin v0.1
   ```
3. Docker-Image bauen & pushen (optional GitHub Container Registry / Docker Hub)

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
